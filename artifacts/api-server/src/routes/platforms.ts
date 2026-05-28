import type { PlatformConfig } from "./platform-proxy";

export const TIVRA: PlatformConfig = {
  slug: "tivra",
  base: "https://api.h5r1xc.xyz/xxapi",
  origin: "https://tivrapay9.com",
  referer: "https://tivrapay9.com/",
  gateHeaderName: "x-rs-cfg-tivpayreqgate",
  gateHeaderValue: "A7K9X2M8Q4P1Z",
  clientId: "qCugMQpFELOzY3tDqpWHWP0ZJxoChfXpqAxoemiO",
};

export const MILES: PlatformConfig = {
  slug: "miles",
  base: "https://api.gronix.xyz/xxapi",
  origin: "https://milesm.skin",
  referer: "https://milesm.skin/",
  gateHeaderName: "x-rs-cfg-milesreqgate",
  gateHeaderValue: "A7M2X9Q4L8KP",
  clientId: "GPSya2Os3wRErSnjx3juhF7o51Ofvf8oG1tdBOYY",
};

export const PLATFORMS: PlatformConfig[] = [TIVRA, MILES];
