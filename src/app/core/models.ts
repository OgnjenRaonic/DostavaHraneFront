export type Role = 'DISPATCHER' | 'DRIVER';
export type OrderStatus = 'NEW' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'PREPAID';
export type StopKind = 'PICKUP' | 'DROPOFF';
export type Placement = 'END' | 'BEST';

export interface LoginResponse {
  username: string;
  role: Role;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export type StoredAuth = LoginResponse;

export interface MeDto {
  id: number;
  username: string;
  name: string;
  role: Role;
  onShift: boolean;
}

export interface OrderDto {
  id: number;
  restaurantId: number;
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string | null;
  restaurantLatitude: number | null;
  restaurantLongitude: number | null;
  restaurantOrderRef: string | null;
  customerName: string | null;
  customerPhone: string;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  note: string | null;
  paymentMethod: PaymentMethod;
  amountToCollect: number;
  status: OrderStatus;
  driverId: number | null;
  driverName: string | null;
  readyAt: string | null;
  createdAt: string;
  assignedAt: string | null;
  acknowledgedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  problemNote: string | null;
  cancelReason: string | null;
}

export interface OrderWriteDto {
  restaurantId: number;
  restaurantOrderRef?: string | null;
  customerName?: string | null;
  customerPhone: string;
  deliveryAddress: string;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  note?: string | null;
  paymentMethod: PaymentMethod;
  amountToCollect?: number | null;
  readyInMinutes?: number | null;
  readyAt?: string | null;
  driverId?: number | null;
  placement?: Placement | null;
}

export interface StopRef {
  orderId: number;
  kind: StopKind;
}

export interface RouteStopDto {
  orderId: number;
  kind: StopKind;
  etaAt: string;
  departureAt: string;
  waitMinutes: number;
  legKm: number;
  order: OrderDto;
}

export interface DriverRouteDto {
  driverId: number;
  driverName: string;
  driverPhone: string | null;
  onShift: boolean;
  routeVersion: number;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastLocationAt: string | null;
  locationFresh: boolean;
  ordersOnBoard: number;
  ordersToPickUp: number;
  unacknowledgedCount: number;
  estimatedFinishAt: string | null;
  totalKm: number;
  maxOnBoard: number;
  overCapacity: boolean;
  stops: RouteStopDto[];
}

export interface BoardDto {
  unassigned: OrderDto[];
  problems: OrderDto[];
  drivers: DriverRouteDto[];
  generatedAt: string;
}

export interface SuggestionDto {
  driverId: number;
  driverName: string;
  onShift: boolean;
  locationKnown: boolean;
  currentDriver: boolean;
  stopCount: number;
  ordersOnBoard: number;
  extraMinutes: number;
  othersDelayMinutes: number;
  costDelta: number;
  pickupEtaAt: string;
  deliveryEtaAt: string;
  finishAt: string;
  withinCapacity: boolean;
  routeVersion: number;
  stops: StopRef[];
}

export interface OptimizationDto {
  driverId: number;
  routeVersion: number;
  changed: boolean;
  currentFinishAt: string;
  currentKm: number;
  suggestedFinishAt: string;
  suggestedKm: number;
  savedMinutes: number;
  deliveryMinutesSaved: number;
  stops: StopRef[];
}

export interface RestaurantDto {
  id: number;
  name: string;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  defaultPrepMinutes: number;
  active: boolean;
}

export interface RestaurantWriteDto {
  name: string;
  address: string;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  note?: string | null;
  defaultPrepMinutes?: number | null;
  active?: boolean | null;
}

export interface UserDto {
  id: number;
  username: string;
  name: string;
  phoneNumber: string | null;
  role: Role;
  active: boolean;
  onShift: boolean;
  lastLocationAt: string | null;
}

export interface UserCreateDto {
  username: string;
  name: string;
  phoneNumber?: string | null;
  password: string;
  role: Role;
}

export interface UserUpdateDto {
  name: string;
  phoneNumber?: string | null;
  password?: string | null;
  active?: boolean | null;
}

export interface DailyReportDto {
  date: string;
  created: number;
  delivered: number;
  failed: number;
  cancelled: number;
  open: number;
  cashCollected: number;
  cardCollected: number;
  averageDeliveryMinutes: number | null;
  drivers: {
    driverId: number;
    driverName: string;
    delivered: number;
    failed: number;
    cashCollected: number;
    cardCollected: number;
    averageDeliveryMinutes: number | null;
  }[];
  restaurants: {
    restaurantId: number;
    restaurantName: string;
    delivered: number;
    cancelled: number;
    total: number;
  }[];
}

export interface DriverDayDto {
  date: string;
  deliveredCount: number;
  cashCollected: number;
  cardCollected: number;
  delivered: OrderDto[];
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}
