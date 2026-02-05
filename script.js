const videoInput = document.getElementById("videoInput");
const imageInput = document.getElementById("imageInput");
const video = document.getElementById("video");

const trimStartEl = document.getElementById("trimStart");
const trimEndEl = document.getElementById("trimEnd");

const ratioEl = document.getElementById("ratio");
const filterEl = document.getElementById("filter");

const textEl = document.getElementById("text");
const textXEl = document.getElementById("textX");
const textYEl = document.getElementById("textY");
const textSizeEl = document.getElementById("textSize");

const imgXEl = document.getElementById("imgX");
const imgYEl = document.getElementById("imgY");

const exportBtn = document.getElementById("exportBtn");
const statusEl = document.getElementById("status");

let videoFile = null;
let imageFile = null;

const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

function setStatus(msg) {
  statusEl.textContent = msg;
}

videoInput.addEventListener("change", (e) => {
  videoFile = e.target.files?.[0] || null;

  if (!videoFile) {
    exportBtn.disabled = true;
    return;
  }

  const url = URL.createObjectURL(videoFile);
  video.src = url;

  exportBtn.disabled = false;
  setStatus("Video loaded. Ready to export.");
});

imageInput.addEventListener("change", (e) => {
  imageFile = e.target.files?.[0] || null;
  if (imageFile) setStatus("Sticker image loaded.");
});

function getFilterFFmpeg(filterName) {
  // Simple but effective filters
  if (filterName === "vivid") return "eq=contrast=1.2:saturation=1.35:brightness=0.02";
  if (filterName === "cinema") return "eq=contrast=1.25:saturation=1.15:brightness=-0.02";
  if (filterName === "bw") return "hue=s=0";
  if (filterName === "warm") return "eq=contrast=1.1:saturation=1.2, colorbalance=rs=0.05:gs=0.02:bs=-0.03";
  if (filterName === "cool") return "eq=contrast=1.1:saturation=1.15, colorbalance=rs=-0.03:gs=0.01:bs=0.05";
  return null;
}

function getCropForRatio(ratio) {
  // Crop center to match ratio
  // Using expressions: iw = input width, ih = input height
  if (ratio === "16:9") {
    return "crop='if(gt(a,16/9),ih*16/9,iw)':'if(gt(a,16/9),ih,iw*9/16)'";
  }
  if (ratio === "9:16") {
    return "crop='if(gt(a,9/16),ih*9/16,iw)':'if(gt(a,9/16),ih,iw*16/9)'";
  }
  if (ratio === "1:1") {
    return "crop='min(iw,ih)':'min(iw,ih)'";
  }
  return null;
}

exportBtn.addEventListener("click", async () => {
  if (!videoFile) return;

  exportBtn.disabled = true;

  try {
    setStatus("Loading Nexus Engine (FFmpeg)... first time takes 15-40 seconds.");

    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    setStatus("Preparing files...");

    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(videoFile));

    if (imageFile) {
      ffmpeg.FS("writeFile", "sticker.png", await fetchFile(imageFile));
    }

    const trimStart = parseFloat(trimStartEl.value || "0");
    const trimEnd = trimEndEl.value === "" ? null : parseFloat(trimEndEl.value);

    const ratio = ratioEl.value;
    const filter = filterEl.value;

    const text = (textEl.value || "").trim();
    const textX = parseInt(textXEl.value || "40");
    const textY = parseInt(textYEl.value || "60");
    const textSize = parseInt(textSizeEl.value || "44");

    const imgX = parseInt(imgXEl.value || "100");
    const imgY = parseInt(imgYEl.value || "100");

    // Build filter chain
    const vf = [];

    const crop = getCropForRatio(ratio);
    if (crop) vf.push(crop);

    const f = getFilterFFmpeg(filter);
    if (f) vf.push(f);

    // Text overlay (safe escaping)
    if (text.length > 0) {
      // Note: default font used. Advanced fonts later.
      vf.push(
        `drawtext=text='${text.replace(/'/g, "\\'")}':x=${textX}:y=${textY}:fontsize=${textSize}:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=12`
      );
    }

    // Sticker overlay
    // If sticker exists, we use filter_complex instead of -vf only
    let args = [];

    // Trim args
    // -ss before -i is faster but less accurate; here we do accurate trim
    args.push("-i", "input.mp4");

    if (imageFile) {
      args.push("-i", "sticker.png");
    }

    // Trim
    if (trimStart > 0) args.push("-ss", String(trimStart));
    if (trimEnd !== null && trimEnd > trimStart) {
      args.push("-to", String(trimEnd));
    }

    // Filters
    if (imageFile) {
      // complex filter for overlay
      const baseVF = vf.length ? vf.join(",") : "null";
      const complex = `[0:v]${baseVF}[v0];[v0][1:v]overlay=${imgX}:${imgY}[v]`;

      args.push(
        "-filter_complex",
        complex,
        "-map",
        "[v]",
        "-map",
        "0:a?"
      );
    } else {
      if (vf.length) args.push("-vf", vf.join(","));
    }

    setStatus("Exporting HQ... (do not close the tab)");

    // HQ export settings (prevents blur)
    args.push(
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-r", "30",
      "-b:v", "9000k",
      "-c:a", "aac",
      "-b:a", "192k",
      "output.mp4"
    );

    await ffmpeg.run(...args);

    setStatus("Finalizing download...");

    const data = ffmpeg.FS("readFile", "output.mp4");
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "nexus_export.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setStatus("Export complete ✅ Video downloaded!");
  } catch (err) {
    console.error(err);
    setStatus("Export failed ❌ (video too big or low RAM). Try shorter video.");
  }

  exportBtn.disabled = false;
});
