const ONES = [
  "",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
];
const TENS = [
  "",
  "",
  "veinte",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
];
const HUNDREDS = [
  "",
  "cien",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];

function formatMillions(n: number): string {
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const word =
    millions === 1 ? "un millón" : `${numberToWords(millions)} millones`;
  return rest > 0 ? `${word} ${numberToWords(rest)}` : word;
}

function formatThousands(n: number): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const word = thousands === 1 ? "mil" : `${numberToWords(thousands)} mil`;
  return rest > 0 ? `${word} ${numberToWords(rest)}` : word;
}

function formatHundreds(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const word = rest === 0 && h === 1 ? "cien" : HUNDREDS[h];
  return rest > 0 ? `${word} ${numberToWords(rest)}` : word;
}

export function numberToWords(n: number): string {
  if (n === 0) {
    return "cero";
  }
  if (n < 0) {
    return `menos ${numberToWords(-n)}`;
  }

  const integer = Math.floor(n);

  if (integer >= 1_000_000) {
    return formatMillions(integer);
  }
  if (integer >= 1000) {
    return formatThousands(integer);
  }
  if (integer >= 100) {
    return formatHundreds(integer);
  }
  if (integer >= 20) {
    const t = Math.floor(integer / 10);
    const o = integer % 10;
    return o > 0 ? `${TENS[t]} y ${ONES[o]}` : TENS[t];
  }

  return ONES[integer];
}

export function formatAmountInWords(amount: number): string {
  const integer = Math.floor(amount);
  const cents = Math.round((amount - integer) * 100);
  const intWords = numberToWords(integer).toUpperCase();
  return cents > 0
    ? `${intWords} con ${cents.toString().padStart(2, "0")}/100`
    : `${intWords} con 00/100`;
}
