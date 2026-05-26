"use client";

import {
  Download,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type MouseEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { saveOrderDesignAction } from "@/modules/orders/actions/update-order-status.action";
import type {
  OrderDesignProduct,
  OrderWithHistory,
} from "@/modules/orders/types";
import {
  GARMENT_COMPONENTS,
  GARMENT_LABELS,
  type GarmentType,
} from "./garment-svgs";

type View = "front" | "back";

type LogoState = {
  src: string;
  x: number; // % from left of container
  y: number; // % from top of container
  scale: number;
  rotation: number;
  opacity: number;
};

type GarmentDesignerProps = {
  order: OrderWithHistory;
  orgSlug: string;
  itemIndex: number;
  productName: string;
  quantity: number;
  onSaved?: () => void;
};

const DEFAULT_LOGO: Omit<LogoState, "src"> = {
  x: 35,
  y: 30,
  scale: 1,
  rotation: 0,
  opacity: 90,
};

export function GarmentDesigner({
  order,
  orgSlug: _orgSlug,
  itemIndex: _itemIndex,
  productName,
  quantity,
  onSaved,
}: GarmentDesignerProps) {
  const [garmentType, setGarmentType] = useState<GarmentType>("campera");
  const [view, setView] = useState<View>("front");
  const [logo, setLogo] = useState<LogoState | null>(null);
  const [notes, setNotes] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const GarmentComponent = GARMENT_COMPONENTS[garmentType][view];

  // Drag handlers
  const getRelativePos = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) {
      return { x: 0, y: 0 };
    }
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!logo) {
        return;
      }
      e.preventDefault();
      setIsDragging(true);
      const pos = getRelativePos(e.clientX, e.clientY);
      dragOffset.current = { x: pos.x - logo.x, y: pos.y - logo.y };
    },
    [logo, getRelativePos]
  );

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!(isDragging && logo)) {
        return;
      }
      const pos = getRelativePos(e.clientX, e.clientY);
      setLogo((prev) =>
        prev
          ? {
              ...prev,
              x: Math.max(5, Math.min(85, pos.x - dragOffset.current.x)),
              y: Math.max(5, Math.min(85, pos.y - dragOffset.current.y)),
            }
          : prev
      );
    },
    [isDragging, logo, getRelativePos]
  );

  const onMouseUp = useCallback(() => setIsDragging(false), []);

  // Touch support
  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!logo) {
        return;
      }
      const touch = e.touches[0];
      setIsDragging(true);
      const pos = getRelativePos(touch.clientX, touch.clientY);
      dragOffset.current = { x: pos.x - logo.x, y: pos.y - logo.y };
    },
    [logo, getRelativePos]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!(isDragging && logo)) {
        return;
      }
      e.preventDefault();
      const touch = e.touches[0];
      const pos = getRelativePos(touch.clientX, touch.clientY);
      setLogo((prev) =>
        prev
          ? {
              ...prev,
              x: Math.max(5, Math.min(85, pos.x - dragOffset.current.x)),
              y: Math.max(5, Math.min(85, pos.y - dragOffset.current.y)),
            }
          : prev
      );
    },
    [isDragging, logo, getRelativePos]
  );

  useEffect(() => {
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [onMouseUp]);

  // Logo upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes (PNG, JPG, SVG)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogo({ src: ev.target?.result as string, ...DEFAULT_LOGO });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const designProduct: OrderDesignProduct = {
      product_id: null,
      product_name: productName,
      quantity,
      size: "",
      logo_position: `${view === "front" ? "Frente" : "Dorso"} — ${garmentType}`,
      logo_description: notes,
      personalization_type: [],
      colors: "",
      reflective_tape: garmentType === "chaleco",
      reflective_tape_position:
        garmentType === "chaleco" ? "Torso y hombros" : "",
      additional_notes: notes,
      reference_image: logo?.src ?? null,
    };

    const result = await saveOrderDesignAction(order.id, {
      products: [designProduct],
      general_notes: notes,
      client_approved_at: null,
      created_by: null,
    });

    setIsSaving(false);
    if (result.success) {
      toast.success("Boceto guardado");
      onSaved?.();
    } else {
      toast.error(result.error ?? "Error al guardar");
    }
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: PDF export builds complex HTML template with conditional logo positioning
  const handleExportPDF = async () => {
    if (!exportRef.current) {
      return;
    }
    setIsExporting(true);

    try {
      const { generatePDFFromHTML } = await import("@/lib/pdf-generator");

      const customer =
        order.quotes?.customers?.fantasy_name ||
        order.quotes?.customers?.business_name ||
        "Cliente";

      const logoStyle = logo
        ? `position:absolute; left:${logo.x}%; top:${logo.y}%; width:${80 * logo.scale}px; transform:rotate(${logo.rotation}deg) translate(-50%,-50%); opacity:${logo.opacity / 100};`
        : "";

      const garmentSvgEl = exportRef.current.querySelector("svg");
      const svgContent = garmentSvgEl?.outerHTML ?? "";

      const html = `
        <html><head><meta charset="utf-8">
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding:32px; color:#1e293b; }
          .document-copy { max-width:720px; margin:0 auto; }
          .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #e2e8f0; padding-bottom:20px; margin-bottom:24px; }
          .info-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; background:#f8fafc; border-radius:8px; padding:16px; margin-bottom:24px; font-size:13px; }
          .garment-area { position:relative; width:340px; margin:0 auto 24px; border:1px solid #e2e8f0; border-radius:12px; padding:16px; background:#f8fafc; }
          .garment-area svg { width:100%; height:auto; }
          .logo-overlay { ${logoStyle} }
          .specs { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px; font-size:13px; }
          .specs h3 { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:#64748b; margin-bottom:12px; }
          .spec-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f1f5f9; }
          .spec-row:last-child { border:none; }
          .footer { margin-top:32px; padding-top:16px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; font-size:11px; color:#94a3b8; }
          .signature-area { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:32px; }
          .sig-box { border-top:1px solid #94a3b8; padding-top:8px; font-size:12px; color:#64748b; text-align:center; }
        </style>
        </head><body>
        <div class="document-copy">
          <div class="header">
            <div>
              <h1 style="font-size:22px;font-weight:700;color:#0f172a;">Boceto de Diseño</h1>
              <p style="font-size:13px;color:#64748b;margin-top:4px;">Pedido ${order.order_number} — Para aprobación del cliente</p>
            </div>
            <div style="text-align:right;font-size:13px;">
              <p style="color:#64748b;">Fecha</p>
              <p style="font-weight:600;">${new Date().toLocaleDateString("es-AR")}</p>
            </div>
          </div>

          <div class="info-grid">
            <div><p style="color:#64748b;margin-bottom:4px;">Cliente</p><p style="font-weight:600;">${customer}</p></div>
            <div><p style="color:#64748b;margin-bottom:4px;">Prenda</p><p style="font-weight:600;">${productName} (${GARMENT_LABELS[garmentType]})</p></div>
            <div><p style="color:#64748b;margin-bottom:4px;">Cantidad</p><p style="font-weight:600;">${quantity} unidades</p></div>
          </div>

          <div class="garment-area">
            <p style="font-size:11px;color:#94a3b8;text-align:center;margin-bottom:8px;">${view === "front" ? "Vista frente" : "Vista dorso"}</p>
            ${svgContent}
            ${logo ? `<img class="logo-overlay" src="${logo.src}" style="${logoStyle}" />` : ""}
          </div>

          <div class="specs">
            <h3>Especificaciones del diseño</h3>
            <div class="spec-row"><span style="color:#64748b;">Tipo de prenda</span><span style="font-weight:600;">${GARMENT_LABELS[garmentType]}</span></div>
            <div class="spec-row"><span style="color:#64748b;">Vista</span><span style="font-weight:600;">${view === "front" ? "Frente" : "Dorso"}</span></div>
            <div class="spec-row"><span style="color:#64748b;">Logo incluido</span><span style="font-weight:600;">${logo ? "Sí" : "No"}</span></div>
            ${garmentType === "chaleco" ? '<div class="spec-row"><span style="color:#64748b;">Franjas refractarias</span><span style="font-weight:600;">Sí — torso y hombros</span></div>' : ""}
            ${notes ? `<div class="spec-row" style="flex-direction:column;gap:6px;"><span style="color:#64748b;">Notas del diseñador</span><span>${notes}</span></div>` : ""}
          </div>

          <div class="signature-area">
            <div class="sig-box">Aprobado por cliente<br><span style="font-size:11px;">${customer}</span></div>
            <div class="sig-box">Diseñador responsable<br><span style="font-size:11px;">Rhinos App</span></div>
          </div>

          <div class="footer">
            <span>Rhinos App · Estado de Pedidos</span>
            <span>Documento de aprobación de diseño</span>
          </div>
        </div>
        </body></html>
      `;

      await generatePDFFromHTML(html, `boceto-${order.order_number}.pdf`);
      toast.success("PDF generado correctamente");
    } catch (err) {
      console.error(err);
      toast.error("Error al generar el PDF");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controles superiores */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Tipo de prenda */}
        <Tabs
          onValueChange={(v) => setGarmentType(v as GarmentType)}
          value={garmentType}
        >
          <TabsList>
            {(Object.keys(GARMENT_LABELS) as GarmentType[]).map((type) => (
              <TabsTrigger key={type} value={type}>
                {GARMENT_LABELS[type]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Frente / Dorso */}
        <div className="flex overflow-hidden rounded-lg border">
          <button
            className={`px-4 py-1.5 font-medium text-sm transition-colors ${view === "front" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setView("front")}
            type="button"
          >
            Frente
          </button>
          <button
            className={`px-4 py-1.5 font-medium text-sm transition-colors ${view === "back" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setView("back")}
            type="button"
          >
            Dorso
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Canvas interactivo */}
        <div className="space-y-3">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: garment canvas area — drag container needs mouse/touch events */}
          {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: drag-and-drop canvas intentionally uses non-interactive element */}
          <div
            className={`relative select-none overflow-hidden rounded-xl border-2 bg-slate-50 dark:bg-slate-900 ${isDragging ? "cursor-grabbing border-primary" : ""} ${!isDragging && logo ? "cursor-grab border-border" : ""} ${isDragging || logo ? "" : "border-muted-foreground/30 border-dashed"}`}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onTouchEnd={onMouseUp}
            onTouchMove={onTouchMove}
            ref={containerRef}
            style={{ aspectRatio: "4/5" }}
          >
            {/* Prenda */}
            <div
              className="absolute inset-0 flex items-center justify-center p-6"
              ref={exportRef}
            >
              <GarmentComponent fill="#e8edf5" stroke="#94a3b8" />
            </div>

            {/* Logo draggable */}
            {logo && (
              // biome-ignore lint/a11y/noNoninteractiveElementInteractions: draggable logo uses mouse/touch for positioning
              // biome-ignore lint/performance/noImgElement: base64 user-uploaded logo, Next.js Image not suitable
              // biome-ignore lint/correctness/useImageSize: dynamic user-uploaded logo without fixed dimensions
              <img
                alt="Logo posicionable — arrastrá para mover"
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
                src={logo.src}
                style={{
                  position: "absolute",
                  left: `${logo.x}%`,
                  top: `${logo.y}%`,
                  width: `${80 * logo.scale}px`,
                  transform: `translate(-50%, -50%) rotate(${logo.rotation}deg)`,
                  opacity: logo.opacity / 100,
                  cursor: isDragging ? "grabbing" : "grab",
                  userSelect: "none",
                  pointerEvents: "auto",
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
                  maxWidth: "60%",
                }}
              />
            )}

            {/* Hint sin logo */}
            {!logo && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-muted-foreground/40 text-sm">
                  Subí un logo y arrastrálo a la prenda
                </p>
              </div>
            )}

            {/* Label vista */}
            <div className="-translate-x-1/2 absolute bottom-2 left-1/2 rounded-full border bg-background/80 px-3 py-0.5 text-muted-foreground text-xs backdrop-blur-sm">
              {view === "front" ? "Vista frente" : "Vista dorso"}
            </div>
          </div>

          {/* Upload logo */}
          <input
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
            ref={fileInputRef}
            type="file"
          />
          <Button
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
          >
            <Upload className="mr-2 h-4 w-4" />
            {logo ? "Cambiar logo" : "Subir logo"}
          </Button>
        </div>

        {/* Panel de ajustes */}
        <div className="space-y-4">
          {logo ? (
            <>
              {/* Tamaño */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Tamaño del logo</Label>
                  <span className="text-muted-foreground text-xs">
                    {Math.round(logo.scale * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ZoomOut className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <Slider
                    max={3}
                    min={0.3}
                    onValueChange={([v]) =>
                      setLogo((p) => (p ? { ...p, scale: v } : p))
                    }
                    step={0.05}
                    value={[logo.scale]}
                  />
                  <ZoomIn className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </div>
              </div>

              {/* Rotación */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Rotación</Label>
                  <div className="flex gap-1">
                    <Button
                      className="h-7 w-7"
                      onClick={() =>
                        setLogo((p) =>
                          p ? { ...p, rotation: p.rotation - 15 } : p
                        )
                      }
                      size="icon"
                      variant="ghost"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        setLogo((p) => (p ? { ...p, rotation: 0 } : p))
                      }
                      size="sm"
                      variant="ghost"
                    >
                      0°
                    </Button>
                    <Button
                      className="h-7 w-7"
                      onClick={() =>
                        setLogo((p) =>
                          p ? { ...p, rotation: p.rotation + 15 } : p
                        )
                      }
                      size="icon"
                      variant="ghost"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Slider
                  max={180}
                  min={-180}
                  onValueChange={([v]) =>
                    setLogo((p) => (p ? { ...p, rotation: v } : p))
                  }
                  step={1}
                  value={[logo.rotation]}
                />
              </div>

              {/* Opacidad */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Opacidad</Label>
                  <span className="text-muted-foreground text-xs">
                    {logo.opacity}%
                  </span>
                </div>
                <Slider
                  max={100}
                  min={20}
                  onValueChange={([v]) =>
                    setLogo((p) => (p ? { ...p, opacity: v } : p))
                  }
                  step={5}
                  value={[logo.opacity]}
                />
              </div>

              {/* Eliminar logo */}
              <Button
                className="w-full text-rose-600 hover:text-rose-700"
                onClick={() => setLogo(null)}
                variant="outline"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Quitar logo
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <Upload className="mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium text-muted-foreground text-sm">
                Sin logo cargado
              </p>
              <p className="mt-1 text-muted-foreground/60 text-xs">
                Subí el logo del cliente para posicionarlo
              </p>
            </div>
          )}

          {/* Notas del diseño */}
          <div className="space-y-1.5">
            <Label className="text-sm">Notas del diseño</Label>
            <Textarea
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Colores, instrucciones especiales, tipo de bordado..."
              rows={3}
              value={notes}
            />
          </div>

          {/* Acciones */}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="w-full"
              disabled={isExporting}
              onClick={handleExportPDF}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Generando PDF..." : "Descargar PDF para cliente"}
            </Button>
            <Button
              className="w-full"
              disabled={isSaving}
              onClick={handleSave}
              variant="outline"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Guardando..." : "Guardar boceto"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
