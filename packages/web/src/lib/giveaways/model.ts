export type StoreId = "epic-games" | "prime-gaming" | "gog" | "steam";

export type GiveawayImages = {
  wide: string | null;
  tall: string | null;
  thumbnail: string | null;
};

export type Giveaway = {
  id: string;
  title: string;
  description: string;
  url: string | null;
  images: GiveawayImages;
  seller: string;
  price: {
    original: number;
    formatted: string;
    currency: string;
  } | null;
  freeUntil: string;
  store: StoreId;
};

export type GiveawaysResponse = {
  count: number;
  giveaways: Giveaway[];
  errors: Array<{ store: StoreId; error: string }>;
};

const STORE_LABELS = {
  "epic-games": "Epic Games",
  "prime-gaming": "Prime Gaming",
  gog: "GOG",
  steam: "Steam",
} satisfies Record<StoreId, string>;

const expiryFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function getGiveawayImage(images: GiveawayImages): string | null {
  return images.wide ?? images.thumbnail ?? images.tall;
}

export function formatStore(store: StoreId): string {
  return STORE_LABELS[store];
}

export function formatExpiry(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : expiryFormatter.format(date).replace(" at ", ", ");
}
