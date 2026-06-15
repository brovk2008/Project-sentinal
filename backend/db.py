import os
import sqlite3
import re
from typing import List, Dict, Any

class CatalystRow:
    def __init__(self, data_dict: dict, col_names: list):
        self._data = data_dict
        self._col_names = col_names
        self._values = []
        for col in col_names:
            val = None
            # ZCQL returns dict of format { "TableName": { "columnName": value } }
            for table_data in data_dict.values():
                if isinstance(table_data, dict) and col in table_data:
                    val = table_data[col]
                    break
            if val is None:
                # Fallback to flat dictionary lookup
                val = data_dict.get(col)
            self._values.append(val)
        self._tuple = tuple(self._values)

    def __getitem__(self, index):
        if isinstance(index, int):
            return self._tuple[index]
        raise KeyError(f"Invalid row index type: {type(index)}")

    def __getattr__(self, name):
        if name in self._col_names:
            idx = self._col_names.index(name)
            return self._tuple[idx]
        raise AttributeError(f"'CatalystRow' object has no attribute '{name}'")

    def __len__(self):
        return len(self._tuple)

    def __repr__(self):
        return repr(self._tuple)

class CatalystQueryResult:
    def __init__(self, rows: list):
        self.rows = rows
        self.index = 0

    def fetchall(self) -> list:
        return self.rows

    def fetchone(self) -> Any:
        if self.index < len(self.rows):
            row = self.rows[self.index]
            self.index += 1
            return row
        return None

class CatalystDBClient:
    def __init__(self):
        self.is_production = os.getenv("ENV") == "production"
        self.sqlite_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sentinel_local.db")
        self._app = None
        
        self.init_error = None
        
        if self.is_production:
            try:
                import zcatalyst_sdk
                self._app = zcatalyst_sdk.initialize()
                print("[Catalyst DB Client] Successfully initialized zcatalyst-sdk in production.")
            except Exception as e:
                import traceback
                self.init_error = traceback.format_exc()
                print(f"[Catalyst DB Client] Failed to initialize zcatalyst-sdk on startup: {e}.")

    def execute(self, query: Any, params: dict = None) -> CatalystQueryResult:
        query_str = str(query).strip()
        
        # Lazy initialization check in production if not initialized on startup
        if self.is_production and self._app is None:
            try:
                import zcatalyst_sdk
                self._app = zcatalyst_sdk.initialize()
                print("[Catalyst DB Client] Lazily initialized zcatalyst-sdk successfully.")
            except Exception as e:
                import traceback
                self.init_error = traceback.format_exc()
                
        if self._app is None:
            # SQLite fallback local mode
            conn = sqlite3.connect(self.sqlite_path)
            cursor = conn.cursor()
            try:
                # Handle parameter syntax mapping if needed
                # SQLite natively supports :name parameters
                if params:
                    cursor.execute(query_str, params)
                else:
                    cursor.execute(query_str)
                rows = cursor.fetchall()
                conn.commit()
                return CatalystQueryResult(rows)
            except Exception as e:
                print(f"[Catalyst DB Client] SQLite query error: {e}")
                print(f"Query: {query_str}")
                print(f"Params: {params}")
                raise e
            finally:
                conn.close()
        else:
            # Catalyst production mode
            try:
                zcql = self._app.zcql()
                interpolated_query = self.interpolate_query(query_str, params)
                raw_results = zcql.execute_query(interpolated_query)
                col_names = self.extract_select_columns(query_str)
                rows = [CatalystRow(r, col_names) for r in raw_results]
                return CatalystQueryResult(rows)
            except Exception as e:
                print(f"[Catalyst DB Client] ZCQL query error: {e}")
                print(f"Query: {query_str}")
                print(f"Params: {params}")
                raise e

    def read_sql(self, query: Any, params: dict = None):
        import pandas as pd
        query_str = str(query).strip()
        
        # Ensure lazy initialization is checked
        if self.is_production and self._app is None:
            try:
                import zcatalyst_sdk
                self._app = zcatalyst_sdk.initialize()
            except Exception:
                pass
                
        if self._app is None:
            conn = sqlite3.connect(self.sqlite_path)
            try:
                # pandas natively supports reading from sqlite3 connection
                return pd.read_sql(query_str, conn, params=params)
            finally:
                conn.close()
        else:
            result = self.execute(query_str, params)
            col_names = self.extract_select_columns(query_str)
            data_list = []
            for row in result.fetchall():
                data_list.append(list(row._tuple))
            return pd.DataFrame(data_list, columns=col_names)

    def interpolate_query(self, query: str, params: dict) -> str:
        if not params:
            return query
        # Replace placeholders in descending key length to avoid substring collision
        for k in sorted(params.keys(), key=len, reverse=True):
            v = params[k]
            placeholder = f":{k}"
            if v is None:
                rep = "NULL"
            elif isinstance(v, bool):
                rep = "true" if v else "false"
            elif isinstance(v, (int, float)):
                rep = str(v)
            else:
                escaped = str(v).replace("'", "''")
                rep = f"'{escaped}'"
            query = query.replace(placeholder, rep)
        return query

    def extract_select_columns(self, query: str) -> list:
        # Strip comments and clean up query string
        query_clean = re.sub(r'--.*?\n', '', query)
        query_clean = re.sub(r'\s+', ' ', query_clean).strip()
        
        match = re.search(r'SELECT\s+(.+?)\s+FROM', query_clean, re.IGNORECASE | re.DOTALL)
        if not match:
            return []
        select_part = match.group(1)
        
        parts = []
        paren_depth = 0
        current = []
        for char in select_part:
            if char == '(':
                paren_depth += 1
            elif char == ')':
                paren_depth -= 1
            if char == ',' and paren_depth == 0:
                parts.append("".join(current).strip())
                current = []
            else:
                current.append(char)
        if current:
            parts.append("".join(current).strip())
            
        columns = []
        for p in parts:
            alias_match = re.search(r'\s+AS\s+(\w+)', p, re.IGNORECASE)
            if alias_match:
                columns.append(alias_match.group(1).strip())
            else:
                col_name = p.split('.')[-1].strip()
                col_name = re.sub(r'[^\w]', '', col_name)
                columns.append(col_name)
        return columns

db_client = CatalystDBClient()

def get_db():
    yield db_client
