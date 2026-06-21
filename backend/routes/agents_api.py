import json
import asyncio
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from services.agent_orchestrator import PlannerAgent

router = APIRouter(tags=["Agents v2"])

class GoalRequestSchema(BaseModel):
    goal: str

class RunAgentSchema(BaseModel):
    goal: str
    subtasks: List[Dict[str, Any]]

@router.post("/plan")
def generate_agent_plan(case_id: str, payload: GoalRequestSchema):
    """
    Decomposes the goal into a checklist of subtasks and returns them.
    Does not execute the actual subtasks.
    """
    try:
        planner = PlannerAgent(case_id)
        subtasks = planner.generate_plan(payload.goal)
        return {"subtasks": subtasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/run")
async def run_agent_pipeline(case_id: str, payload: RunAgentSchema):
    """
    Triggers the Planner Agent execution for the selected subtasks list
    and streams status progress events using Server-Sent Events (SSE).
    """
    planner = PlannerAgent(case_id)
    
    async def event_generator():
        queue = asyncio.Queue()
        
        def callback(event_dict):
            asyncio.run_coroutine_threadsafe(queue.put(event_dict), loop)
            
        loop = asyncio.get_event_loop()
        
        async def run_pipeline():
            try:
                res = planner.execute_plan(payload.goal, payload.subtasks, progress_callback=callback)
                await queue.put({"stage": "result", "data": res})
            except Exception as e:
                await queue.put({"stage": "error", "message": str(e)})
                
        asyncio.create_task(run_pipeline())
        
        while True:
            item = await queue.get()
            yield f"data: {json.dumps(item)}\n\n"
            
            if item.get("stage") in ["result", "error", "complete"] and item.get("stage") != "complete":
                break
                
    return StreamingResponse(event_generator(), media_type="text/event-stream")
