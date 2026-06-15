def chunk_text(text: str, chunk_size: int = 512, overlap: int = 50) -> list:
    """
    Chunks text into segments of `chunk_size` words with an overlap of `overlap` words.
    """
    words = text.split()
    if not words:
        return []
    
    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i:i + chunk_size]
        chunks.append(" ".join(chunk_words))
        if i + chunk_size >= len(words):
            break
        # Slide window forward by chunk_size - overlap
        i += max(1, chunk_size - overlap)
        
    return chunks
