import sharp from "sharp";

const source = "public/images/logo_solo.svg";
const background = "#f8fafc";

async function createIcon(size, maskable = false) {
  const padding = maskable ? Math.round(size * 0.2) : Math.round(size * 0.1);
  const iconSize = size - padding * 2;
  const suffix = maskable ? "-maskable" : "";

  const logo = await sharp(source)
    .resize(iconSize, iconSize, { fit: "contain" })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`public/icons/pwa-${size}x${size}${suffix}.png`);
}

await Promise.all([
  createIcon(192),
  createIcon(512),
  createIcon(192, true),
  createIcon(512, true),
]);

console.log("Generated PWA icons in public/icons");
