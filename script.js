const { createFFmpeg, fetchFile } = FFmpeg;

// UI Elements
const audioFileInput = document.getElementById('audioFileInput');
const generateButton = document.getElementById('generateButton');
const statusDiv = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const downloadLink = document.getElementById('downloadLink');
const canvas = document.getElementById('frameCanvas');
const ctx = canvas.getContext('2d');

// --- Configuration ---
const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const VIDEO_FPS = 30;
const WAVEFORM_COLOR = '#00ff00';
const BACKGROUND_COLOR = '#000000';

canvas.width = VIDEO_WIDTH;
canvas.height = VIDEO_HEIGHT;

let audioFile = null;

// Initialize FFmpeg
const ffmpeg = createFFmpeg({
    log: true,
    progress: ({ ratio }) => {
        if (ratio >= 0 && ratio <= 1) {
            updateStatus(`Encoding video...`);
            updateProgress(ratio * 100);
        }
    },
});

audioFileInput.onchange = (e) => {
    audioFile = e.target.files[0];
    if (audioFile) {
        generateButton.disabled = false;
        statusDiv.textContent = `File selected: ${audioFile.name}`;
        downloadLink.style.display = 'none';
    }
};

generateButton.onclick = async () => {
    if (!audioFile) return;

    generateButton.disabled = true;
    progressBar.style.display = 'block';
    updateProgress(0);

    try {
        updateStatus("Loading FFmpeg core...");
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load();
        }

        updateStatus("Reading and decoding audio file...");
        const audioData = await decodeAudioFile(audioFile);

        updateStatus("Generating waveform frames...");
        await generateFrames(audioData);

        updateStatus("Preparing for encoding...");
        // Write the original audio file to FFmpeg's virtual file system
        ffmpeg.FS('writeFile', audioFile.name, await fetchFile(audioFile));

        updateStatus("Running FFmpeg to create video...");
        const outputFilename = 'waveform-video.mp4';

        await ffmpeg.run(
            '-framerate', `${VIDEO_FPS}`,
            '-i', 'frame%04d.png',      // Input image sequence
            '-i', audioFile.name,       // Input audio file
            '-c:v', 'libx264',          // Video codec
            '-pix_fmt', 'yuv420p',      // Pixel format for compatibility
            '-c:a', 'aac',              // Audio codec
            '-shortest',                // Finish encoding when the shortest input ends
            '-y',                       // Overwrite output file if it exists
            outputFilename
        );

        updateStatus("Encoding complete. Preparing download...");
        const data = ffmpeg.FS('readFile', outputFilename);
        const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
        const videoUrl = URL.createObjectURL(videoBlob);

        downloadLink.href = videoUrl;
        downloadLink.download = outputFilename;
        downloadLink.style.display = 'block';
        statusDiv.textContent = 'Video is ready for download!';
        
        // Cleanup virtual file system for next run
        cleanupFrames(audioData);
        ffmpeg.FS('unlink', audioFile.name);
        ffmpeg.FS('unlink', outputFilename);

    } catch (error) {
        console.error(error);
        statusDiv.textContent = `An error occurred: ${error.message}`;
    } finally {
        generateButton.disabled = false;
        progressBar.style.display = 'none';
    }
};

async function decodeAudioFile(file) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
}

async function generateFrames(audioBuffer) {
    const duration = audioBuffer.duration;
    const totalFrames = Math.floor(duration * VIDEO_FPS);
    const channelData = audioBuffer.getChannelData(0); // Use the first channel

    for (let i = 0; i < totalFrames; i++) {
        const frameProgress = (i / totalFrames) * 100;
        updateStatus(`Generating frame ${i + 1} of ${totalFrames}...`);
        updateProgress(frameProgress);

        // Calculate the audio segment for this frame
        const startSample = Math.floor((i / VIDEO_FPS) * audioBuffer.sampleRate);
        const endSample = Math.floor(((i + 1) / VIDEO_FPS) * audioBuffer.sampleRate);
        const segment = channelData.slice(startSample, endSample);

        drawWaveform(segment);

        // Convert canvas to image and write to FFmpeg FS
        const frameData = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const frameName = `frame${String(i).padStart(4, '0')}.png`;
        ffmpeg.FS('writeFile', frameName, await fetchFile(frameData));
    }
}

function drawWaveform(segment) {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    ctx.strokeStyle = WAVEFORM_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const middleY = VIDEO_HEIGHT / 2;
    const step = Math.ceil(segment.length / VIDEO_WIDTH);

    for (let i = 0; i < VIDEO_WIDTH; i++) {
        let min = 1.0;
        let max = -1.0;
        // Find peak values in the segment slice for this pixel
        for (let j = 0; j < step; j++) {
            const sample = segment[i * step + j];
            if (sample < min) min = sample;
            if (sample > max) max = sample;
        }
        
        // Draw a vertical line from min to max amplitude
        const y_max = (max * middleY) + middleY;
        const y_min = (min * middleY) + middleY;

        ctx.moveTo(i, y_min);
        ctx.lineTo(i, y_max);
    }
    ctx.stroke();
}

// Helper to cleanup frames from FFmpeg's virtual filesystem
function cleanupFrames(audioBuffer) {
    const totalFrames = Math.floor(audioBuffer.duration * VIDEO_FPS);
    for (let i = 0; i < totalFrames; i++) {
        try {
            const frameName = `frame${String(i).padStart(4, '0')}.png`;
            ffmpeg.FS('unlink', frameName);
        } catch (e) {
            // Ignore errors if file doesn't exist
        }
    }
}

function updateStatus(message) {
    statusDiv.textContent = message;
}

function updateProgress(percent) {
    progressBar.value = percent;
}