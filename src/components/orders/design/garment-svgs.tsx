// SVG paths para cada tipo de prenda - frente y dorso

export type GarmentType = "remera" | "campera" | "chaleco" | "casco";

export const GARMENT_LABELS: Record<GarmentType, string> = {
  remera: "Remera",
  campera: "Campera",
  chaleco: "Chaleco refractario",
  casco: "Casco",
};

// Remera
export const RemeraFront = ({ fill = "#e8edf5", stroke = "#94a3b8" }) => (
  <svg fill="none" viewBox="0 0 400 480" xmlns="http://www.w3.org/2000/svg">
    <title>Remera — vista frente</title>
    {/* Body */}
    <path
      d="M 140,110 L 60,75 L 25,140 L 75,160 L 75,410 L 325,410 L 325,160 L 375,140 L 340,75 L 260,110 C 240,130 160,130 140,110 Z"
      fill={fill}
      stroke={stroke}
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
    {/* Neck line */}
    <path
      d="M 140,110 Q 200,145 260,110"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
    />
    {/* Sleeve lines */}
    <line
      opacity="0.4"
      stroke={stroke}
      strokeWidth="1.5"
      x1="75"
      x2="75"
      y1="160"
      y2="165"
    />
    <line
      opacity="0.4"
      stroke={stroke}
      strokeWidth="1.5"
      x1="325"
      x2="325"
      y1="160"
      y2="165"
    />
    {/* Hem */}
    <line
      opacity="0.3"
      stroke={stroke}
      strokeWidth="1.5"
      x1="75"
      x2="325"
      y1="408"
      y2="408"
    />
  </svg>
);

export const RemeraBack = ({ fill = "#e8edf5", stroke = "#94a3b8" }) => (
  <svg fill="none" viewBox="0 0 400 480" xmlns="http://www.w3.org/2000/svg">
    <title>Remera — vista dorso</title>
    <path
      d="M 140,110 L 60,75 L 25,140 L 75,160 L 75,410 L 325,410 L 325,160 L 375,140 L 340,75 L 260,110 C 240,98 160,98 140,110 Z"
      fill={fill}
      stroke={stroke}
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
    {/* Back neck */}
    <path
      d="M 155,110 Q 200,105 245,110"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
    />
    <line
      opacity="0.3"
      stroke={stroke}
      strokeWidth="1.5"
      x1="75"
      x2="325"
      y1="408"
      y2="408"
    />
  </svg>
);

// Campera
export const CamperaFront = ({ fill = "#e8edf5", stroke = "#94a3b8" }) => (
  <svg fill="none" viewBox="0 0 400 520" xmlns="http://www.w3.org/2000/svg">
    <title>Campera — vista frente</title>
    {/* Body */}
    <path
      d="M 145,80 L 55,60 L 15,145 L 75,165 L 75,450 L 325,450 L 325,165 L 385,145 L 345,60 L 255,80 C 235,105 165,105 145,80 Z"
      fill={fill}
      stroke={stroke}
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
    {/* Collar left */}
    <path
      d="M 145,80 L 175,130 L 200,140"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
    />
    {/* Collar right */}
    <path
      d="M 255,80 L 225,130 L 200,140"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
    />
    {/* Zipper line */}
    <line
      opacity="0.5"
      stroke={stroke}
      strokeDasharray="6,4"
      strokeWidth="1.5"
      x1="200"
      x2="200"
      y1="140"
      y2="450"
    />
    {/* Pockets */}
    <rect
      fill="none"
      height="45"
      opacity="0.5"
      rx="4"
      stroke={stroke}
      strokeWidth="1.5"
      width="60"
      x="90"
      y="290"
    />
    <rect
      fill="none"
      height="45"
      opacity="0.5"
      rx="4"
      stroke={stroke}
      strokeWidth="1.5"
      width="60"
      x="250"
      y="290"
    />
    {/* Cuffs */}
    <line
      opacity="0.6"
      stroke={stroke}
      strokeLinecap="round"
      strokeWidth="3"
      x1="15"
      x2="30"
      y1="145"
      y2="145"
    />
    <line
      opacity="0.6"
      stroke={stroke}
      strokeLinecap="round"
      strokeWidth="3"
      x1="385"
      x2="370"
      y1="145"
      y2="145"
    />
  </svg>
);

export const CamperaBack = ({ fill = "#e8edf5", stroke = "#94a3b8" }) => (
  <svg fill="none" viewBox="0 0 400 520" xmlns="http://www.w3.org/2000/svg">
    <title>Campera — vista dorso</title>
    <path
      d="M 145,80 L 55,60 L 15,145 L 75,165 L 75,450 L 325,450 L 325,165 L 385,145 L 345,60 L 255,80 C 235,95 165,95 145,80 Z"
      fill={fill}
      stroke={stroke}
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
    {/* Back yoke line */}
    <path
      d="M 80,200 Q 200,210 320,200"
      fill="none"
      opacity="0.4"
      stroke={stroke}
      strokeWidth="1.5"
    />
    {/* Hem */}
    <line
      opacity="0.3"
      stroke={stroke}
      strokeWidth="1.5"
      x1="75"
      x2="325"
      y1="448"
      y2="448"
    />
  </svg>
);

// Chaleco refractario
export const ChalecoFront = ({ fill = "#e8edf5", stroke = "#94a3b8" }) => (
  <svg fill="none" viewBox="0 0 400 520" xmlns="http://www.w3.org/2000/svg">
    <title>Chaleco refractario — vista frente</title>
    {/* Body sin mangas */}
    <path
      d="M 155,75 L 105,65 L 90,130 L 90,450 L 310,450 L 310,130 L 295,65 L 245,75 C 230,100 170,100 155,75 Z"
      fill={fill}
      stroke={stroke}
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
    {/* Collar V */}
    <path
      d="M 155,75 L 185,135 L 200,145 L 215,135 L 245,75"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
    />
    {/* Zipper */}
    <line
      opacity="0.5"
      stroke={stroke}
      strokeDasharray="6,4"
      strokeWidth="1.5"
      x1="200"
      x2="200"
      y1="145"
      y2="450"
    />
    {/* Franjas refractarias */}
    <rect
      fill="#fbbf24"
      height="18"
      opacity="0.7"
      rx="3"
      stroke="#f59e0b"
      strokeWidth="1.5"
      width="220"
      x="90"
      y="290"
    />
    <rect
      fill="#fbbf24"
      height="18"
      opacity="0.7"
      rx="3"
      stroke="#f59e0b"
      strokeWidth="1.5"
      width="220"
      x="90"
      y="340"
    />
    {/* Shoulder stripes */}
    <rect
      fill="#fbbf24"
      height="18"
      opacity="0.7"
      rx="3"
      stroke="#f59e0b"
      strokeWidth="1.5"
      width="220"
      x="90"
      y="130"
    />
    {/* Pockets */}
    <rect
      fill="none"
      height="40"
      opacity="0.5"
      rx="4"
      stroke={stroke}
      strokeWidth="1.5"
      width="55"
      x="100"
      y="200"
    />
    <rect
      fill="none"
      height="40"
      opacity="0.5"
      rx="4"
      stroke={stroke}
      strokeWidth="1.5"
      width="55"
      x="245"
      y="200"
    />
  </svg>
);

export const ChalecoBack = ({ fill = "#e8edf5", stroke = "#94a3b8" }) => (
  <svg fill="none" viewBox="0 0 400 520" xmlns="http://www.w3.org/2000/svg">
    <title>Chaleco refractario — vista dorso</title>
    <path
      d="M 155,75 L 105,65 L 90,130 L 90,450 L 310,450 L 310,130 L 295,65 L 245,75 C 230,90 170,90 155,75 Z"
      fill={fill}
      stroke={stroke}
      strokeLinejoin="round"
      strokeWidth="2.5"
    />
    <rect
      fill="#fbbf24"
      height="18"
      opacity="0.7"
      rx="3"
      stroke="#f59e0b"
      strokeWidth="1.5"
      width="220"
      x="90"
      y="290"
    />
    <rect
      fill="#fbbf24"
      height="18"
      opacity="0.7"
      rx="3"
      stroke="#f59e0b"
      strokeWidth="1.5"
      width="220"
      x="90"
      y="340"
    />
    <rect
      fill="#fbbf24"
      height="18"
      opacity="0.7"
      rx="3"
      stroke="#f59e0b"
      strokeWidth="1.5"
      width="220"
      x="90"
      y="130"
    />
  </svg>
);

// Casco (solo vista frontal)
export const CascoFront = ({ fill = "#e8edf5", stroke = "#94a3b8" }) => (
  <svg fill="none" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
    <title>Casco de seguridad</title>
    {/* Dome */}
    <path
      d="M 80,220 Q 80,80 200,60 Q 320,80 320,220 Z"
      fill={fill}
      stroke={stroke}
      strokeWidth="2.5"
    />
    {/* Brim */}
    <path
      d="M 50,220 Q 50,250 200,255 Q 350,250 350,220 L 320,220 Q 320,240 200,245 Q 80,240 80,220 Z"
      fill={fill}
      stroke={stroke}
      strokeWidth="2.5"
    />
    {/* Inner brim line */}
    <path
      d="M 80,220 Q 200,235 320,220"
      fill="none"
      opacity="0.5"
      stroke={stroke}
      strokeWidth="1.5"
    />
    {/* Visor area */}
    <path
      d="M 120,200 Q 120,215 200,220 Q 280,215 280,200 L 270,170 Q 200,165 130,170 Z"
      fill={fill}
      opacity="0.6"
      stroke={stroke}
      strokeWidth="1.5"
    />
    {/* Center vent */}
    <line
      opacity="0.3"
      stroke={stroke}
      strokeWidth="2"
      x1="200"
      x2="200"
      y1="70"
      y2="165"
    />
  </svg>
);

export const GARMENT_COMPONENTS: Record<
  GarmentType,
  {
    front: React.ComponentType<{ fill?: string; stroke?: string }>;
    back: React.ComponentType<{ fill?: string; stroke?: string }>;
  }
> = {
  remera: { front: RemeraFront, back: RemeraBack },
  campera: { front: CamperaFront, back: CamperaBack },
  chaleco: { front: ChalecoFront, back: ChalecoBack },
  casco: { front: CascoFront, back: CascoFront },
};
