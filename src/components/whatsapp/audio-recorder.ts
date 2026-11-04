export function releaseMicrophone(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() || []) {
    track.stop();
  }
}

export function stopRecorder(recorder: MediaRecorder | null): void {
  if (recorder?.state === "recording") {
    recorder.stop();
  }
}

export async function createAudioRecorder(
  onStopped: (file: File) => void
): Promise<{ stream: MediaStream; recorder: MediaRecorder }> {
  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    throw new Error(
      "Este navegador no permite grabar. Podés adjuntar un archivo de audio."
    );
  }
  if (!MediaRecorder.isTypeSupported("audio/mp4")) {
    throw new Error(
      "Este navegador no ofrece grabación MP4. Podés adjuntar un audio MP3, M4A, OGG, WAV o WebM."
    );
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    const recorder = new MediaRecorder(stream, { mimeType: "audio/mp4" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      releaseMicrophone(stream);
      onStopped(new File(chunks, "grabacion.m4a", { type: "audio/mp4" }));
    };
    recorder.onerror = () => {
      releaseMicrophone(stream);
      stopRecorder(recorder);
    };
    return { stream, recorder };
  } catch (error) {
    releaseMicrophone(stream);
    throw error;
  }
}
