"use client";

import {
  MicrophoneIcon,
  PaperclipIcon,
  StopIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SimulationState } from "@/modules/whatsapp/server/simulation";
import {
  createAudioRecorder,
  releaseMicrophone,
  stopRecorder,
} from "./audio-recorder";

import { requestAudio, type Upload, uploadAudioFile } from "./audio-upload";

const phaseLabels: Record<string, string> = {
  uploading: "Subiendo audio…",
  transcribing: "Transcribiendo audio…",
  responding: "Preparando respuesta…",
};

type Capability = {
  ready: boolean;
  needsMigration: boolean;
  enabled: boolean;
  configured: boolean;
  message: string | null;
};
type Transcribed = {
  messageId: string;
  state: SimulationState;
  status: string;
  transcript: string | null;
  error: string | null;
  retryable: boolean;
};

async function completeAudioUpload(base: string, uploadId: string) {
  const result = await requestAudio<Transcribed>(
    `${base}/uploads/${uploadId}/complete`,
    { method: "POST" }
  );
  if (!result.transcript || result.status !== "SUCCEEDED") {
    throw new Error(
      result.error ||
        "La transcripción sigue pendiente. Reintentá en unos segundos."
    );
  }
  return { ...result, transcript: result.transcript };
}

function AudioSetupNotice({
  capability,
  error,
  onEnable,
}: {
  capability: Capability;
  error: string | null;
  onEnable: () => Promise<void>;
}) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <p>{capability.message}</p>
      {!capability.needsMigration &&
      capability.configured &&
      !capability.enabled ? (
        <Button
          className="mt-2"
          onClick={onEnable}
          size="sm"
          type="button"
          variant="outline"
        >
          Habilitar audios en este sandbox
        </Button>
      ) : null}
      {error ? <p className="mt-2 text-destructive">{error}</p> : null}
    </div>
  );
}

export function WhatsAppAudioComposer({
  orgSlug,
  state,
  customerId,
  priceListId,
  disabled,
  onBusyChange,
  onTranscript,
  onSessionReady,
}: {
  orgSlug: string;
  state: SimulationState | undefined;
  customerId: string;
  priceListId: string;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onSessionReady: (state: SimulationState) => void;
  onTranscript: (
    messageId: string,
    transcript: string,
    session: SimulationState
  ) => Promise<void>;
}) {
  const base = `/api/org/${encodeURIComponent(orgSlug)}/whatsapp/simulacion/audio`;
  const [capability, setCapability] = useState<Capability | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "recording" | "uploading" | "transcribing" | "responding"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const mounted = useRef(true);
  const requestId = useRef<string | null>(null);
  const pending = useRef<Upload | null>(null);

  useEffect(() => {
    mounted.current = true;
    requestAudio<Capability>(base)
      .then(setCapability)
      .catch(() =>
        setError("No se pudo comprobar la configuración de audios.")
      );
    return () => {
      mounted.current = false;
      stopRecorder(recorder.current);
      releaseMicrophone(stream.current);
    };
  }, [base]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (phase !== "recording") {
      return;
    }
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    const stop = setTimeout(() => stopRecorder(recorder.current), 120_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [phase]);

  function selectFile(selected: File | undefined) {
    if (!selected) {
      return;
    }
    if (!selected.size || selected.size > 4_000_000) {
      setError("Elegí un audio de hasta 4 MB y 2 minutos.");
      return;
    }
    setFile(selected);
    setError(null);
    requestId.current = crypto.randomUUID();
    pending.current = null;
  }

  async function record() {
    setError(null);
    onBusyChange(true);
    try {
      const capture = await createAudioRecorder((recorded) => {
        if (!mounted.current) {
          return;
        }
        selectFile(recorded);
        setPhase("idle");
        onBusyChange(false);
      });
      stream.current = capture.stream;
      recorder.current = capture.recorder;
      if (!mounted.current) {
        releaseMicrophone(capture.stream);
        return;
      }
      setFile(null);
      setSeconds(0);
      setPhase("recording");
      capture.recorder.start();
    } catch (caught) {
      releaseMicrophone(stream.current);
      onBusyChange(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo acceder al micrófono."
      );
    }
  }

  async function send() {
    if (disabled) {
      return;
    }
    const clientMessageId = requestId.current;
    if (!(file && clientMessageId)) {
      return;
    }
    onBusyChange(true);
    setError(null);
    try {
      if (!pending.current) {
        setPhase("uploading");
        pending.current = await uploadAudioFile({
          base,
          file,
          clientMessageId,
          state,
          customerId,
          priceListId,
          onSessionReady,
        });
      }
      setPhase("transcribing");
      const transcribed = await completeAudioUpload(
        base,
        pending.current.uploadId
      );
      setPhase("responding");
      await onTranscript(
        transcribed.messageId,
        transcribed.transcript,
        transcribed.state
      );
      setFile(null);
      pending.current = null;
      requestId.current = null;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo procesar el audio."
      );
    } finally {
      setPhase("idle");
      onBusyChange(false);
    }
  }

  async function enable() {
    setError(null);
    try {
      setCapability(
        await requestAudio<Capability>(base, {
          method: "PATCH",
          body: JSON.stringify({ enabled: true }),
        })
      );
    } catch {
      setError(
        "No se pudieron habilitar los audios. Necesitás permiso para configurar WhatsApp y la migración aplicada."
      );
    }
  }

  if (!capability) {
    return <p className="text-muted-foreground text-xs">Comprobando audios…</p>;
  }
  if (!capability.ready) {
    return (
      <AudioSetupNotice
        capability={capability}
        error={error}
        onEnable={enable}
      />
    );
  }

  const working = phase !== "idle" && phase !== "recording";
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {phase === "recording" ? (
          <Button
            onClick={() => stopRecorder(recorder.current)}
            size="sm"
            type="button"
            variant="destructive"
          >
            <StopIcon className="mr-2 size-4" /> Detener · {seconds}s
          </Button>
        ) : (
          <Button
            disabled={disabled}
            onClick={record}
            size="sm"
            type="button"
            variant="outline"
          >
            <MicrophoneIcon className="mr-2 size-4" /> Grabar audio
          </Button>
        )}
        <Button
          disabled={disabled || working || phase === "recording"}
          onClick={() => input.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          <PaperclipIcon className="mr-2 size-4" /> Adjuntar audio
        </Button>
        <input
          accept="audio/*,.webm,.m4a,.ogg,.mp3,.wav"
          className="hidden"
          onChange={(event) => {
            selectFile(event.target.files?.[0]);
            event.target.value = "";
          }}
          ref={input}
          type="file"
        />
        <span className="text-muted-foreground text-xs">
          Hasta 2 minutos · 4 MB
        </span>
      </div>
      {file && preview ? (
        <div className="flex flex-wrap items-center gap-2">
          {/* The spoken content is displayed as a transcript in the chat after sending. */}
          {/* biome-ignore lint/a11y/useMediaCaption: recording preview precedes speech transcription */}
          <audio
            aria-label="Escuchar audio antes de enviarlo"
            className="max-w-full"
            controls
            src={preview}
          />
          <Button
            disabled={disabled || working}
            onClick={send}
            size="sm"
            type="button"
          >
            {pending.current ? "Reintentar audio" : "Enviar audio"}
          </Button>
          <Button
            aria-label="Descartar audio"
            disabled={working}
            onClick={() => {
              setFile(null);
              pending.current = null;
              requestId.current = null;
              setError(null);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <TrashIcon className="size-4" />
          </Button>
        </div>
      ) : null}
      {working ? (
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {phaseLabels[phase]}
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
