let socket;
let mediaRecorder;
let audioChunks = [];
let selectedGender = "Female";
let isOutputMic = false;
let totalTranscribedTimeSeconds = 0;
let userIsFree = true; // Track free usage state
const MAX_FREE_SECONDS = 2 * 60; // 2 minutes = 120 seconds
let userPlan = "free"; // can be "free", "pro", "topup", or "weekend"

const MAX_PRO_DAILY_SECONDS = 5 * 60;
const MAX_TOPUP_SECONDS = 8.6 * 60;
const MAX_WEEKEND_DAILY_SECONDS = 17 * 60;

let topUpUsed = false;
let weekendStart = null;






window.onload = function () {
  if (isUserBlocked()) {
  console.log("🛑 User is blocked, showing pricing immediately");
  showPricingToast();
  return;
}
    setupDropdown("inputLanguageDropdown", "inputFlag", "inputLanguageText");
    setupDropdown("outputLanguageDropdown", "outputFlag", "outputLanguageText");
    const savedGender = localStorage.getItem("selectedGender") || "Female";
    setGender(savedGender);


};

function setupDropdown(dropdownId, flagId, textId) {
    const dropdown = document.getElementById(dropdownId);
    const selected = dropdown.querySelector(".selected");
    const dropdownMenu = dropdown.querySelector(".dropdown-menu");

    // 🔁 Load saved language on startup
    const savedText = localStorage.getItem(textId);
    const savedFlag = localStorage.getItem(flagId);
    if (savedText && savedFlag) {
        document.getElementById(flagId).src = `https://flagcdn.com/w40/${savedFlag}.png`;
        document.getElementById(textId).textContent = savedText;
    }

    selected.addEventListener("click", (event) => {
        event.stopPropagation();
        dropdownMenu.style.display = dropdownMenu.style.display === "flex" ? "none" : "flex";
    });

    dropdownMenu.querySelectorAll("div").forEach(option => {
        option.addEventListener("click", () => {
            const flagCode = option.dataset.flag;
            const langText = option.textContent.trim();

            document.getElementById(flagId).src = `https://flagcdn.com/w40/${flagCode}.png`;
            document.getElementById(textId).textContent = langText;
            dropdownMenu.style.display = "none";

            // 💾 Save selected language to localStorage
            localStorage.setItem(textId, langText);
            localStorage.setItem(flagId, flagCode);
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

    const genderText = document.getElementById("selectedGender");
    if (genderText) {
        genderText.textContent = gender;
    }

    const dropdownMenu = document.querySelector(".gender-dropdown-menu");
    if (dropdownMenu) {
        dropdownMenu.style.display = "none";
    }

    localStorage.setItem("selectedGender", gender); // 💾 Save user choice
}


function isUserBlocked() {
  const blockedUntil = parseInt(localStorage.getItem('blockedUntil') || "0");
  return Date.now() < blockedUntil;
}

function blockUserFor24Hours() {
  const blockDurationMs = 24 * 60 * 60 * 1000; // 24 hours in ms
  localStorage.setItem('blockedUntil', (Date.now() + blockDurationMs).toString());
}





function setupWebSocket() {
  socket = io.connect();

  socket.on("connect", () => {
    console.log("✅ WebSocket connected");
  });

  socket.on("transcription_result", async (data) => {
    await requestWakeLock(); //🔋 Keep screen awake during translation + speech

    const inputLang = document.getElementById("inputLanguageText").textContent.trim();
    const outputLang = document.getElementById("outputLanguageText").textContent.trim();
    const sourceLang = isOutputMic ? outputLang : inputLang;
    const targetLang = isOutputMic ? inputLang : outputLang;

    // Estimate usage time: 100 characters ≈ 5 seconds
    const estimatedSeconds = Math.ceil(data.text.length / 20);
    totalTranscribedTimeSeconds += estimatedSeconds;

    console.log(`⏱️ Estimated usage: +${estimatedSeconds}s (Total: ${totalTranscribedTimeSeconds}s)`);

const now = new Date();
let limitReached = false;

if (userPlan === "free") {
  if (totalTranscribedTimeSeconds >= MAX_FREE_SECONDS) {
    userIsFree = false;
    limitReached = true;
  }
} else if (userPlan === "pro") {
  const todayKey = `pro_usage_${now.toDateString()}`;
  const todaySeconds = parseFloat(localStorage.getItem(todayKey) || "0");
  if (todaySeconds + estimatedSeconds > MAX_PRO_DAILY_SECONDS) {
    limitReached = true;
  } else {
    localStorage.setItem(todayKey, todaySeconds + estimatedSeconds);
  }
} else if (userPlan === "topup") {
  const used = parseFloat(localStorage.getItem("topup_seconds") || "0");
  if (used + estimatedSeconds > MAX_TOPUP_SECONDS) {
    limitReached = true;
  } else {
    localStorage.setItem("topup_seconds", used + estimatedSeconds);
  }
} else if (userPlan === "weekend") {
  if (!weekendStart) weekendStart = now.getTime();
  const msSinceStart = now.getTime() - weekendStart;
  const daysPassed = Math.floor(msSinceStart / (24 * 60 * 60 * 1000));
  if (daysPassed >= 3) {
    limitReached = true;
  } else {
    const key = `weekend_day${daysPassed}_usage`;
    const used = parseFloat(localStorage.getItem(key) || "0");
    if (used + estimatedSeconds > MAX_WEEKEND_DAILY_SECONDS) {
      limitReached = true;
    } else {
      localStorage.setItem(key, used + estimatedSeconds);
    }
  }
}

if (limitReached) {
  console.log("🔥 PAID PLAN LIMIT REACHED - Blocking user");
  blockUserFor24Hours(); // ✅ Block for 24h
  showPricingToast();    // ✅ Show the toast
  return;
}

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
    button.classList.remove("input-idle", "output-idle");
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
        await requestWakeLock();

    } catch (err) {
        console.error("❌ Microphone access error:", err);
        alert("Microphone access is blocked or denied.");
        button.classList.remove("recording");
        image.classList.remove("recording");
    }
}

async function stopRecording(button) {
  button.classList.remove("recording");

  // ✨ Reset idle styles using CSS classes
  if (button.classList.contains("output-mic")) {
    button.classList.add("output-idle");
    button.classList.remove("input-idle");
  } else {
    button.classList.add("input-idle");
    button.classList.remove("output-idle");
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    await releaseWakeLock();

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

    await requestWakeLock(); // 🔋 Lock screen during speech

    setTimeout(() => audio.play(), 150);

    // Release wake lock after audio ends
    audio.onended = () => {
      releaseWakeLock();
    };

    audio.onerror = () => {
      releaseWakeLock(); // Fallback in case of error
    };

  } catch (err) {
    console.error("❌ Speech generation failed:", err);
    releaseWakeLock(); // Fail-safe release
  }
}


document.addEventListener("click", function (e) {
    const dropdown = document.querySelector(".gender-dropdown");
    const menu = document.querySelector(".gender-dropdown-menu");
    if (!dropdown.contains(e.target)) {
        menu.style.display = "none";
    }
});

document.addEventListener("DOMContentLoaded", () => {
  const inputMicButton = document.querySelector(".mic-button:not(.output-mic)");
  const outputMicButton = document.querySelector(".mic-button.output-mic");

  // ✅ Set initial idle state styles
  inputMicButton.classList.add("input-idle");
  outputMicButton.classList.add("output-idle");

  inputMicButton.addEventListener("click", () => {
    if (inputMicButton.classList.contains("recording")) {
      stopRecording(inputMicButton);
    } else {
      startRecording(inputMicButton);
    }
  });

  outputMicButton.addEventListener("click", () => {
    if (outputMicButton.classList.contains("recording")) {
      stopRecording(outputMicButton);
    } else {
      startRecording(outputMicButton);
    }
  });
});

async function requestMicrophonePermissionEarly() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("✅ Early microphone permission granted.");
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        console.error("❌ Microphone permission blocked or denied on load:", err);
    }
}

window.addEventListener("load", requestMicrophonePermissionEarly);

function showPricingToast() {
  const toast = document.getElementById("pricing-toast");
  toast.classList.remove("hidden");
}

function hidePricingToast() {
  const toast = document.getElementById("pricing-toast");
  toast.classList.add("hidden");
}

function selectPlan(planType) {
  if (window.AndroidBridge && typeof window.AndroidBridge.purchase === "function") {
    // 👇 Wait a bit before hiding to ensure billing overlay loads
    setTimeout(() => hidePricingToast(), 400);
    window.AndroidBridge.purchase(planType);
  } else {
    console.error("⚠️ Billing bridge not available.");
    // Optional: keep the toast visible or show an error state
  }
}


function grantTokensOrResetLimit(plan = "free") {
  userPlan = plan;
  totalTranscribedTimeSeconds = 0;

  if (plan === "pro") {
    const todayKey = `pro_usage_${new Date().toDateString()}`;
    localStorage.setItem(todayKey, "0");
    console.log("✅ Pro subscription: daily limit initialized");
  } else if (plan === "topup") {
    localStorage.setItem("topup_seconds", "0");
  } else if (plan === "weekend") {
    weekendStart = Date.now();
    for (let i = 0; i < 3; i++) {
      localStorage.setItem(`weekend_day${i}_usage`, "0");
    }
  }

  hidePricingToast();
  console.log(`✅ Limit reset: user granted access again for ${plan}`);
}



window.addEventListener("load", () => {
  const splash = document.getElementById("splash-screen");
  setTimeout(() => {
    splash.style.opacity = "0";
    setTimeout(() => {
      splash.style.display = "none";

      // ✅ After splash fades, connect to WebSocket
      setupWebSocket();

      // ✅ Also move mic permission request after splash, for smoothness
      requestMicrophonePermissionEarly();
      
    }, 800);
  }, 1500);
});



// 🔋 WAKE LOCK SUPPORT
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log("🔋 Wake lock is active");
      wakeLock.addEventListener('release', () => {
        console.log("🔓 Wake lock released");
      });
    } else {
      console.warn("🚫 Wake Lock API is not supported on this browser");
    }
  } catch (err) {
    console.error("❌ Wake lock request failed:", err);
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLock !== null) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (err) {
    console.error("❌ Wake lock release failed:", err);
  }
}







