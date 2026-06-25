/** AI Event Architect — tipos del motor de generación de espacios. */

export type ObjType =
  | "stage" | "backstage" | "ledScreen" | "techBooth" | "streaming"
  | "chairBlock" | "aisle" | "roundTable" | "headTable" | "danceFloor"
  | "registrationTable" | "merchTable" | "bookstore" | "coffeeBreak"
  | "vipArea" | "sponsorBooth" | "bathroom" | "entrance" | "exit"
  | "securityPoint" | "medicalPoint";

export interface VenueObject {
  id: string;
  type: ObjType;
  label: string;
  x: number; y: number;          // metros (esquina sup-izq)
  width: number; height: number; // metros
  rotation: number;              // grados
  capacityImpact: number;        // personas que aporta (sillas/mesas) o resta
  metadata?: { rows?: number; cols?: number; seats?: number; [k: string]: unknown };
}

export type VenueShape = "Rectangular" | "Cuadrada" | "En L" | "Abanico" | "Circular";

export interface Venue {
  widthM: number; lengthM: number; heightM: number;
  shape: VenueShape; eventType: string;
}

export interface Metrics {
  capacity: number; recommended: number; chairs: number; tables: number;
  areaTotal: number; areaOccupied: number; areaFree: number; pctOccupied: number;
  zones: number; accesses: number; exits: number;
  visibility: number; comfort: number; circulation: number;     // 0-100
  ingressMin: number; evacMin: number;
}

export type Level = "excelente" | "bueno" | "mejorable" | "critico";
export interface Recommendation { id: string; title: string; level: Level; detail: string; }

export interface Layout { venue: Venue; objects: VenueObject[]; metrics: Metrics; recommendations: Recommendation[]; }

export interface GenerateInput {
  eventType: string; widthM: number; lengthM: number; heightM: number;
  targetCapacity: number; prompt?: string; accesses?: number; exits?: number; columns?: number;
}
