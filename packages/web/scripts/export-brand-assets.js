import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const ORANGE = "#FF6B00";
const BLACK = "#11181C";
const WHITE = "#FFFFFF";
const DARK_BACKGROUND = "#0C0A09";
const STATIC_DIRECTORY = resolve(import.meta.dir, "../static");
const RASTER_DIRECTORY = resolve(STATIC_DIRECTORY, "brand");

const WORDMARK_GLYPHS = [
  {
    x: 0,
    path: `
      M786 -20 Q588 -20 431.5 70 Q275 160 184.5 331 Q94 502 94 744
      Q94 987 185 1158.5 Q276 1330 433 1420 Q590 1510 786 1510
      Q913 1510 1022.5 1474.5 Q1132 1439 1217 1371 Q1302 1303 1356 1204.5
      Q1410 1106 1427 980 L1118 980 Q1108 1042 1079.5 1089.5
      Q1051 1137 1008.5 1170.5 Q966 1204 911 1221.5 Q856 1239 792 1239
      Q676 1239 588.5 1181 Q501 1123 452.5 1012.5 Q404 902 404 744
      Q404 583 453 473 Q502 363 589 307 Q676 251 791 251
      Q855 251 909.5 268.5 Q964 286 1007.5 319.5 Q1051 353 1079.5 401
      Q1108 449 1119 510 L1428 510 Q1416 406 1366.5 311 Q1317 216 1235 141
      Q1153 66 1040 23 Q927 -20 786 -20 Z
    `,
  },
  {
    x: 1515,
    path: "M428 1490 L428 0 L128 0 L128 1490 Z",
  },
  {
    x: 2070,
    path: `
      M440 -22 Q334 -22 249.5 15.5 Q165 53 116.5 127.5 Q68 202 68 313
      Q68 406 102.5 469 Q137 532 196.5 570 Q256 608 331.5 628
      Q407 648 490 656 Q587 666 646.5 674.5 Q706 683 733.5 701.5
      Q761 720 761 756 L761 761 Q761 809 741 842 Q721 875 681.5 892.5
      Q642 910 586 910 Q528 910 485 892.5 Q442 875 415 846 Q388 817 375 781
      L100 826 Q129 924 196 992 Q263 1060 362.5 1096 Q462 1132 587 1132
      Q677 1132 762 1110.5 Q847 1089 914.5 1044 Q982 999 1021.5 926.5
      Q1061 854 1061 753 L1061 0 L777 0 L777 155 L767 155 Q740 103 695 63.5
      Q650 24 586.5 1 Q523 -22 440 -22 Z
      M525 189 Q596 189 649.5 217 Q703 245 733 293 Q763 341 763 400 L763 521
      Q750 511 723 503 Q696 495 663 489 Q630 483 598 478 Q566 473 541 470
      Q486 462 444 444 Q402 426 379 396.5 Q356 367 356 321
      Q356 278 378 248.5 Q400 219 438 204 Q476 189 525 189 Z
    `,
  },
  {
    x: 3259,
    path: `
      M128 0 L128 1118 L428 1118 L428 0 Z
      M278 1264 Q210 1264 162 1309 Q114 1354 114 1418
      Q114 1482 162 1527 Q210 1572 278 1572 Q346 1572 394.5 1527.5
      Q443 1483 443 1418 Q443 1354 394.5 1309 Q346 1264 278 1264 Z
    `,
  },
  {
    x: 3814,
    path: `
      M128 0 L128 1118 L406 1118 L421 840 L399 840 Q425 943 475.5 1008
      Q526 1073 594 1104 Q662 1135 737 1135 Q858 1135 932 1058.5
      Q1006 982 1041 822 L1006 822 Q1031 929 1087.5 998.5
      Q1144 1068 1221.5 1101.5 Q1299 1135 1384 1135 Q1487 1135 1567.5 1090
      Q1648 1045 1694.5 960.5 Q1741 876 1741 754 L1741 0 L1441 0 L1441 697
      Q1441 792 1389.5 838 Q1338 884 1263 884 Q1207 884 1165.5 859.5
      Q1124 835 1101.5 791 Q1079 747 1079 688 L1079 0 L789 0 L789 705
      Q789 787 740.5 835.5 Q692 884 615 884 Q562 884 519.5 860
      Q477 836 452.5 789.5 Q428 743 428 676 L428 0 Z
    `,
  },
];

const MARK_VARIANTS = [
  {
    source: "favicon.svg",
    stem: "favicon",
    create: createPrimaryMark,
    ink: BLACK,
    background: WHITE,
  },
  {
    source: "favicon-white.svg",
    stem: "favicon-white",
    create: createPrimaryMark,
    ink: WHITE,
    background: DARK_BACKGROUND,
  },
  {
    source: "favicon-alt.svg",
    stem: "favicon-alt",
    create: createAlternativeMark,
    ink: BLACK,
    background: WHITE,
  },
  {
    source: "favicon-alt-white.svg",
    stem: "favicon-alt-white",
    create: createAlternativeMark,
    ink: WHITE,
    background: DARK_BACKGROUND,
  },
];

const LOGO_VARIANTS = [
  {
    source: "logo.svg",
    stem: "logo",
    create: createPrimaryLogo,
    ink: BLACK,
    background: WHITE,
  },
  {
    source: "logo-white.svg",
    stem: "logo-white",
    create: createPrimaryLogo,
    ink: WHITE,
    background: DARK_BACKGROUND,
  },
  {
    source: "logo-alt.svg",
    stem: "logo-alt",
    create: createAlternativeLogo,
    ink: BLACK,
    background: WHITE,
  },
  {
    source: "logo-alt-white.svg",
    stem: "logo-alt-white",
    create: createAlternativeLogo,
    ink: WHITE,
    background: DARK_BACKGROUND,
  },
];

function normalizePath(path) {
  return path.replace(/\s+/g, " ").trim();
}

function createWordmark(ink) {
  const paths = WORDMARK_GLYPHS.map(
    (glyph) => `<path d="${normalizePath(glyph.path)}" transform="translate(${glyph.x} 0)" />`,
  ).join("");

  return `<g fill="${ink}" transform="translate(152 97) scale(0.044 -0.044)">${paths}</g>`;
}

function createSvg({ title, viewBox, content }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img">`,
    `<title>${title}</title>`,
    content,
    "</svg>",
    "",
  ].join("");
}

function createPrimaryMark(ink, title = "Claim") {
  return createSvg({
    title,
    viewBox: "0 0 128 128",
    content: [
      `<path d="M97.94 30.06A48 48 0 1 0 97.94 97.94" fill="none" stroke="${ink}" stroke-linecap="butt" stroke-width="18"/>`,
      `<path d="M42 67L59 84L99 44" fill="none" stroke="${ORANGE}" stroke-linecap="round" stroke-linejoin="round" stroke-width="13"/>`,
    ].join(""),
  });
}

function createAlternativeMark(ink, title = "Claim alternative logo") {
  return createSvg({
    title,
    viewBox: "0 0 128 128",
    content: [
      `<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round" stroke-width="7">`,
      '<path d="M63 52C55 23 34 18 27 31C21 43 37 52 63 52Z"/>',
      '<path d="M65 52C73 23 94 18 101 31C107 43 91 52 65 52Z"/>',
      '<path d="M20 54H108V68"/>',
      '<path d="M20 54V67L64 79V116L28 103V70"/>',
      "</g>",
      `<path d="M100 68L68 79V111L98 101" fill="none" stroke="${ORANGE}" stroke-linecap="square" stroke-linejoin="round" stroke-width="9"/>`,
    ].join(""),
  });
}

function createPrimaryLogo(ink) {
  const mark = createPrimaryMark(ink).match(/<title>.*?<\/title>(.*)<\/svg>/s)?.[1] ?? "";
  return createSvg({
    title: "Claim",
    viewBox: "0 0 420 128",
    content: `${mark}${createWordmark(ink)}`,
  });
}

function createAlternativeLogo(ink) {
  const mark = createAlternativeMark(ink).match(/<title>.*?<\/title>(.*)<\/svg>/s)?.[1] ?? "";
  return createSvg({
    title: "Claim alternative logo",
    viewBox: "0 0 420 128",
    content: `${mark}${createWordmark(ink)}`,
  });
}

async function writeSvgSources() {
  for (const variant of [...MARK_VARIANTS, ...LOGO_VARIANTS]) {
    await Bun.write(resolve(STATIC_DIRECTORY, variant.source), variant.create(variant.ink));
  }
}

async function exportRaster(source, output, width, height, format, background) {
  let image = sharp(source).resize(width, height, {
    fit: "contain",
  });

  if (format === "png") {
    image = image.png();
  } else {
    image = image.flatten({ background }).jpeg({ chromaSubsampling: "4:4:4", quality: 95 });
  }

  await image.toFile(output);
}

async function verifyRaster(path, width, height, format) {
  const metadata = await sharp(path).metadata();
  const hasExpectedDimensions = metadata.width === width && metadata.height === height;
  const hasExpectedFormat = metadata.format === format;
  const hasExpectedAlpha = format !== "png" || metadata.hasAlpha === true;

  if (!hasExpectedDimensions || !hasExpectedFormat || !hasExpectedAlpha) {
    throw new Error(`Invalid generated asset: ${path}`);
  }
}

async function verifySvg(path) {
  const svg = await readFile(path, "utf8");

  if (svg.includes("<text") || !svg.includes(ORANGE) || !svg.includes("<path")) {
    throw new Error(`Invalid SVG source: ${path}`);
  }
}

async function exportFaviconIco() {
  const sizes = [16, 32, 48];
  const source = resolve(STATIC_DIRECTORY, "favicon.svg");
  const images = await Promise.all(
    sizes.map(async (size) => ({
      data: await sharp(source).resize(size, size).png().toBuffer(),
      size,
    })),
  );
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  let imageOffset = directory.length;
  for (const [index, image] of images.entries()) {
    const entryOffset = 6 + index * 16;
    directory.writeUInt8(image.size, entryOffset);
    directory.writeUInt8(image.size, entryOffset + 1);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(image.data.length, entryOffset + 8);
    directory.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.data.length;
  }

  const output = resolve(STATIC_DIRECTORY, "favicon.ico");
  await Bun.write(output, Buffer.concat([directory, ...images.map(({ data }) => data)]));
  await verifyFaviconIco(output, sizes);
}

async function verifyFaviconIco(path, expectedSizes) {
  const ico = await readFile(path);
  const hasExpectedHeader =
    ico.readUInt16LE(0) === 0 &&
    ico.readUInt16LE(2) === 1 &&
    ico.readUInt16LE(4) === expectedSizes.length;

  if (!hasExpectedHeader) {
    throw new Error(`Invalid generated asset: ${path}`);
  }

  for (const [index, expectedSize] of expectedSizes.entries()) {
    const entryOffset = 6 + index * 16;
    const imageLength = ico.readUInt32LE(entryOffset + 8);
    const imageOffset = ico.readUInt32LE(entryOffset + 12);
    const metadata = await sharp(ico.subarray(imageOffset, imageOffset + imageLength)).metadata();

    if (
      ico.readUInt8(entryOffset) !== expectedSize ||
      ico.readUInt8(entryOffset + 1) !== expectedSize ||
      metadata.format !== "png" ||
      metadata.width !== expectedSize ||
      metadata.height !== expectedSize
    ) {
      throw new Error(`Invalid generated asset: ${path}`);
    }
  }
}

async function exportVariant(variant, widths, aspectRatio) {
  const source = resolve(STATIC_DIRECTORY, variant.source);
  await verifySvg(source);

  for (const width of widths) {
    const height = Math.round(width / aspectRatio);

    for (const format of ["png", "jpeg"]) {
      const extension = format === "jpeg" ? "jpg" : format;
      const output = resolve(RASTER_DIRECTORY, `${variant.stem}-${width}.${extension}`);
      await exportRaster(source, output, width, height, format, variant.background);
      await verifyRaster(output, width, height, format);
    }
  }
}

async function main() {
  await mkdir(RASTER_DIRECTORY, { recursive: true });
  await writeSvgSources();

  for (const variant of MARK_VARIANTS) {
    await exportVariant(variant, [32, 180, 512], 1);
  }

  for (const variant of LOGO_VARIANTS) {
    await exportVariant(variant, [800, 1600], 420 / 128);
  }

  await exportFaviconIco();

  console.log("Generated and verified 8 SVG sources, 40 raster brand assets, and 1 ICO favicon.");
}

await main();
