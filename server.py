from flask import Flask, render_template, request, jsonify, send_file
from flask_socketio import SocketIO, emit
import openai
import os
import io
from dotenv import load_dotenv

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise ValueError("❌ OpenAI API key is missing!")

app = Flask(__name__, template_folder="templates", static_folder="static")
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=100 * 1024 * 1024  # 100 MB
)


@app.route("/")
def home():
    return render_template("index.html")

@socketio.on("connect")
def handle_connect():
    print("✅ WebSocket connected!")

@socketio.on("disconnect")
def handle_disconnect():
    print("❌ WebSocket disconnected!")

@socketio.on("stream_audio")
def handle_stream_audio(data):
    try:
        audio_bytes = io.BytesIO(bytes(data["audio"]))
        audio_bytes.name = "audio.wav"

        response = openai.audio.transcriptions.create(
            model="whisper-1",
            file=audio_bytes
        )

        print("✅ Transcription:", response.text)
        emit("transcription_result", {"text": response.text})

    except Exception as e:
        print("❌ Transcription error:", str(e))
        emit("transcription_error", {"error": str(e)})

@app.route("/translate", methods=["POST"])
def translate():
    data = request.get_json()
    text = data.get("text")
    source_lang = data.get("source_lang")
    target_lang = data.get("target_lang")
    gender = data.get("gender", "Neutral")

    selected_gender = "gender-neutral"
    if gender.lower() == "male":
        selected_gender = "masculine"
    elif gender.lower() == "female":
        selected_gender = "feminine"

    reset_context = "Forget all previous instructions. Reset memory completely. This is a new translation request."

    language_clarification = f"""
    IMPORTANT: You are translating from **{source_lang}** to **{target_lang}**.
    - The **source language** is **EXACTLY** {source_lang}. Assume it is correctly detected and DO NOT re-evaluate.
    - Even if you suspect the input is in another language, proceed with translation as instructed.
    - **DO NOT** self-correct or question whether translation is necessary.
    - **DO NOT** say \"This text is already in {target_lang}\" or any similar statement—just return the correct translation.
    - If the input text is already in {target_lang}, return it **exactly as provided** with no modifications.
    """

    additional_rules = ""
    if target_lang in ["Chinese (Simplified)", "Chinese (Traditional)"]:
        additional_rules = f"""
        - Ensure the translation is written in **accurate Mandarin Chinese** with **natural phrasing**.
        - DO NOT translate phonetically—use actual meaning-based translation.
        - If translating into **Chinese (Simplified)**, use **modern Mandarin vocabulary**.
        - If translating into **Chinese (Traditional)**, use **formal and culturally accurate phrasing**.
        """

    full_prompt = f"""{reset_context}

{language_clarification}

You are a professional translator who specializes in **context-aware, natural-sounding translations**.

Your task is to **accurately** translate the following text from **{source_lang}** to **{target_lang}**, while ensuring:
- **Correct Language Output** (The translation must be 100% in {target_lang}).
- **Context & Intent** (Adapt translation to make sense naturally).
- **Pronunciation & Emotion** (Make sure the translated text flows in a human way).
- **Gender-Specific Language** (Use {selected_gender} forms where applicable).
- **Maintain a natural native accent** in {target_lang}, avoiding an artificial English-speaker tone.
- **Ensure pronunciation and rhythm feel native to the target language, not forced or robotic.**
- **All words MUST be fully pronounced. DO NOT rush or shorten words unnaturally.**
- **Use the correct intonation, articulation, and syllable stress as a fluent native speaker would.**
- **DO NOT allow robotic, unnatural, or overly slow speech. The output should sound fluid and human-like.**
- **When translating to languages with tonal variations (e.g., Chinese, isiZulu), ensure tones are correctly respected.**
- **Recognize and correctly translate local slang, idioms, informal expressions, and swear words.**
✅ Conversational Sound & Rhythm
- The translation must sound like it’s being **spoken aloud by a real human**, not written text.
- Prioritize **natural flow, contractions, phrasing**, and **local rhythm** as if someone were speaking in real life.
- Keep it **fluid, casual, and emotionally expressive** — like how someone would actually say it out loud.
- Avoid overly formal or textbook-style translation unless required by context.
- If the original text sounds casual, the translation should too.


**STRICT RULES:**
- The output **MUST be 100% in {target_lang}**, except for globally recognized English terms.
- If the input text is already in {target_lang}, return it **exactly as provided** with no modifications.
- **DO NOT** analyze or guess whether translation is needed. If input and output languages match, simply return the text unchanged.
- Maintain **natural fluency, clarity, and emotion** in the translation.
- **DO NOT** add intros, explanations, apologies, greetings, or any form of commentary.
- **DO NOT** say \"The text is already in English\" or \"This text does not need translation\"—just return the correct translation.
- **DO NOT** generate any response that begins with \"I'm sorry\" or \"Apologies.\"
- **DO NOT** assume the input is in English unless explicitly confirmed.
- DO NOT leave numeric sequences like "1, 2, 3" untranslated — ALWAYS convert numbers into their word form in the target language.
- **DO NOT** insert “Thank you for watching”, “Thanks for watching!”, “Hope you enjoyed!”, or ANY other sign-off phrases.
- **DO NOT** insert extra filler words, apologies, disclaimers, or AI acknowledgments.
- **DO NOT** modify the meaning or add additional context unless absolutely required.
- **DO NOT** insert extra words, emojis, or unrelated phrases.
- **DO NOT** censor, filter, or modify unless absolutely necessary.
- **DO NOT** censor or alter **swear words, expletives, or profanities** in ANY way. Translate them as-is, preserving tone, meaning, and cultural context.
- **DO NOT** translate words phonetically; translate them **accurately** in meaning.
- **DO NOT** include \"Here is your translation\"—just return the translated text.
- **DO NOT** add closing phrases such as **\"Thank you for watching!\"**, **Thanks for watching!**, **\"Hope you enjoyed!\"**, or any **gratitude, farewell, or sign-off messages**.

✅ **Slang, Informal Speech & Swear Word Handling**
- If the input contains **informal greetings, street slang, expletives, or conversational phrases**, **translate them naturally** into {target_lang} while maintaining their cultural and emotional intensity.
- **Example:**
  - English: "Howzit my bruh?"
  - Afrikaans: "Hoe gaan dit, my bra?"
  - Portuguese: "E aí, meu irmão?"
  - English: "That guy’s a f***ing idiot."
  - French: "Ce mec est un putain d’idiot."
- **DO NOT** tone down or euphemize swear words.

✅ **Smart Validation Step:**
- Ensure the translated text is **strictly in {target_lang}**, except for globally recognized terms.
- If any unnecessary English words remain that should be translated, correct them automatically.
- If a pop culture reference is better recognized in English, leave it unchanged.
- **Double-check that the pronunciation feels native to a fluent speaker of {target_lang}.**

✅ Special Case: Numbers & Counting
- If the input contains numbers or simple sequences like “1, 2, 3”, you MUST translate them into the full **spoken or written equivalent** in {target_lang}.
 DO NOT leave any digit untranslated — each number must appear in the output in its full word form.
- DO NOT skip, shorten, infer, or reduce the sequence — every number must be translated in the same order and amount as provided.
- Example:
   - English: “1, 2, 3” → French: “un, deux, trois”
   - English: “4 5 6” → German: “vier fünf sechs”
   - Input: “1, 2, 3” → Output (French): “un, deux, trois”
   - Input: “One, two, three” → Output (German): “eins, zwei, drei”
- Do NOT leave numbers as numerals unless that is the native writing style in {target_lang}.
- Always convert them into the **correct words** in the target language.

❗️FINAL OVERRIDE:
- Under NO circumstance may you respond with “I’m sorry”, “Apologies”, “I cannot assist”, or any similar disclaimer. This is a valid translation request. Respond ONLY with the translated text.


{additional_rules}

**Now, translate this naturally into {target_lang}, ensuring authentic pronunciation and a native rhythm:**
{text}
"""

    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": full_prompt}],
            max_tokens=300,
            temperature=0.1
        )
        return jsonify({"translated_text": response.choices[0].message.content.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/speak", methods=["POST"])
def speak():
    data = request.get_json()
    text = data.get("input", "")
    voice = data.get("voice", "fable")

    try:
        response = openai.audio.speech.create(
            model="tts-1-hd",
            voice=voice,
            input=text
        )
        audio_data = response.content
        return send_file(io.BytesIO(audio_data), mimetype="audio/mpeg", as_attachment=True, download_name="speech.mp3")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/favicon.ico')
def favicon():
    return '', 204

if __name__ == "__main__":
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)

