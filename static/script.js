let socket;
let mediaRecorder;
let audioChunks = [];
let selectedGender = "Neutral";
let isOutputMic = false;


window.onload = function () {
    setupDropdown("inputLanguageDropdown", "inputFlag", "inputLanguageText");
    setupDropdown("outputLanguageDropdown", "outputFlag", "outputLanguageText");
    setupWebSocket();
};

function setupDropdown(dropdownId, flagId, textId) {
    const dropdown = document.getElementById(dropdownId);
    const selected = dropdown.querySelector(".selected");
    const dropdownMenu = dropdown.querySelector(".dropdown-menu");

    selected.addEventListener("click", (event) => {
        event.stopPropagation();
        dropdownMenu.style.display = dropdownMenu.style.display === "flex" ? "none" : "flex";
    });

    dropdownMenu.querySelectorAll("div").forEach(option => {
        option.addEventListener("click", () => {
            document.getElementById(flagId).src = `https://flagcdn.com/w40/${option.dataset.flag}.png`;
            document.getElementById(textId).textContent = option.textContent.trim();
            dropdownMenu.style.display = "none";
        });
    });

    document.addEventListener("click", (e) => {
        if (!dropdown.contains(e.target)) {
            dropdownMenu.style.display = "none";
        }
    });
}

function toggleGenderDropdown() {
    const menu = document.querySelector(".gender-dropdown-menu");
    menu.style.display = menu.style.display === "flex" ? "none" : "flex";
}

function setGender(gender) {
    selectedGender = gender;
    document.getElementById("selectedGender").textContent = gender;
    document.querySelector(".gender-dropdown-menu").style.display = "none";
}

function setupWebSocket() {
    socket = io.connect();

    socket.on("connect", () => {
        console.log("✅ WebSocket connected");
    });

    socket.on("transcription_result", async (data) => {
      const inputLang = document.getElementById("inputLanguageText").textContent.trim();
      const outputLang = document.getElementById("outputLanguageText").textContent.trim();
      const sourceLang = isOutputMic ? outputLang : inputLang;
      const targetLang = isOutputMic ? inputLang : outputLang;

      console.log(`📝 Received transcription: ${data.text}`);
      console.log(`🔁 Translating from ${sourceLang} → ${targetLang}`);

      const translated = await translateText(data.text, sourceLang, targetLang);

        await speakText(translated);

        setTimeout(() => {
            document.querySelector(".form-image").classList.remove("slowing");
        }, 1000);
    });

    socket.on("transcription_error", (error) => {
        console.error("❌ Transcription error:", error);
    });
}

async function startRecording(button) {
  isOutputMic = button.classList.contains("output-mic");
    const image = document.querySelector(".form-image");
    image.classList.remove("slowing");
    image.classList.add("recording");
    button.classList.add("recording");


    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaRecorder = new MediaRecorder(stream, {
            mimeType: "audio/webm;codecs=opus"
        });
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: "audio/webm" });

            const reader = new FileReader();
            reader.onloadend = () => {
                const arrayBuffer = reader.result;
                const buffer = new Uint8Array(arrayBuffer);
                const lang = button.classList.contains("output-mic")
                    ? document.getElementById("outputLanguageText").textContent.trim()
                    : document.getElementById("inputLanguageText").textContent.trim();

                try {
                    socket.emit("stream_audio", {
                        audio: Array.from(buffer),
                        source_lang: lang
                    });
                } catch (err) {
                    console.error("❌ WebSocket Emit Error:", err);
                }

                image.classList.remove("recording");
                image.classList.add("slowing");
                setTimeout(() => {
                    image.classList.remove("slowing");
                }, 1500);
            };

            reader.readAsArrayBuffer(blob);
        };

        mediaRecorder.start();
    } catch (err) {
        console.error("❌ Microphone access error:", err);
        alert("Microphone access is blocked or denied.");
        button.classList.remove("recording");
        image.classList.remove("recording");
    }
}

function stopRecording(button) {
    button.classList.remove("recording");
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
}

async function translateText(text, sourceLang, targetLang) {
    try {
        const res = await fetch("/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text,
                source_lang: sourceLang,
                target_lang: targetLang,
                gender: selectedGender
            })
        });
        const data = await res.json();
        return data.translated_text || "";
    } catch (err) {
        console.error("❌ Translation failed:", err);
        document.querySelector(".form-image").classList.remove("recording", "slowing");
        return "";
    }
}

async function speakText(text) {
    let voiceModel = "fable";
    if (selectedGender === "Male") voiceModel = "onyx";
    else if (selectedGender === "Female") voiceModel = "nova";

    try {
        const response = await fetch("/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: text, voice: voiceModel })
        });

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        setTimeout(() => audio.play(), 150);
    } catch (err) {
        console.error("❌ Speech generation failed:", err);
    }
}

document.addEventListener("click", function (e) {
    const dropdown = document.querySelector(".gender-dropdown");
    const menu = document.querySelector(".gender-dropdown-menu");
    if (!dropdown.contains(e.target)) {
        menu.style.display = "none";
    }
});
