from google import genai

client = genai.Client(api_key="GyZlkiWdRyvl+FLIBmnFJb4Ff5L9C64lwgeVFTV+CQ7nNJsXb4CvGtaPrZMVzfWI")

response = client.models.generate_content(
    model="gemini-3-flash-preview", contents="Explain how AI works in a few words"
)
print(response.text)