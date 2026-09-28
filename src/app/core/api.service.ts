import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import {
  BoardDto,
  DailyReportDto,
  DriverDayDto,
  DriverRouteDto,
  GeocodeResult,
  LoginResponse,
  MeDto,
  OptimizationDto,
  OrderDto,
  OrderStatus,
  OrderWriteDto,
  Placement,
  RestaurantDto,
  RestaurantWriteDto,
  StopRef,
  SuggestionDto,
  UserCreateDto,
  UserDto,
  UserUpdateDto,
} from './models';

type JsonRecord = Record<string, unknown>;

/** Greska sa API-ja; errorCode je iz tela odgovora (npr. ROUTE_CHANGED). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: string,
  ) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly auth = inject(AuthService);
  readonly apiBaseUrl = this.resolveApiBaseUrl();

  async login(username: string, password: string): Promise<LoginResponse> {
    const res = await this.apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrPhoneNumber: username.trim(), password }),
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Pogresno korisnicko ime ili lozinka.');
      throw new Error(`Prijava nije uspela (${res.status}).`);
    }
    return (await res.json()) as LoginResponse;
  }

  async logout(): Promise<void> {
    try {
      await this.authFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Odjava lokalno uspeva i kad server nije dostupan.
    }
  }

  me(): Promise<MeDto> {
    return this.getJson('/api/me');
  }

  // ---------------------------------------------------------------- dispecer: tabla i porudzbine

  board(): Promise<BoardDto> {
    return this.getJson('/api/dispatch/board');
  }

  createOrder(body: OrderWriteDto): Promise<OrderDto> {
    return this.sendJson('/api/dispatch/orders', 'POST', body);
  }

  updateOrder(orderId: number, body: OrderWriteDto): Promise<OrderDto> {
    return this.sendJson(`/api/dispatch/orders/${orderId}`, 'PUT', body);
  }

  cancelOrder(orderId: number, reason: string): Promise<OrderDto> {
    return this.sendJson(`/api/dispatch/orders/${orderId}/cancel`, 'POST', { reason });
  }

  reopenOrder(orderId: number): Promise<OrderDto> {
    return this.sendJson(`/api/dispatch/orders/${orderId}/reopen`, 'POST', {});
  }

  history(params: {
    from: string;
    to: string;
    status?: OrderStatus | '';
    driverId?: number | null;
    restaurantId?: number | null;
  }): Promise<OrderDto[]> {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    if (params.status) query.set('status', params.status);
    if (params.driverId) query.set('driverId', String(params.driverId));
    if (params.restaurantId) query.set('restaurantId', String(params.restaurantId));
    return this.getJson(`/api/dispatch/orders?${query.toString()}`);
  }

  dailyReport(date: string): Promise<DailyReportDto> {
    return this.getJson(`/api/dispatch/reports/daily?date=${encodeURIComponent(date)}`);
  }

  // ---------------------------------------------------------------- dispecer: rute

  setRoute(driverId: number, version: number | null, stops: StopRef[]): Promise<DriverRouteDto> {
    return this.sendJson(`/api/dispatch/drivers/${driverId}/route`, 'PUT', {
      version,
      stops: stops.map((stop) => ({ orderId: stop.orderId, kind: stop.kind })),
    });
  }

  assign(orderId: number, driverId: number, placement: Placement): Promise<DriverRouteDto> {
    return this.sendJson(`/api/dispatch/orders/${orderId}/assign`, 'POST', { driverId, placement });
  }

  unassign(orderId: number): Promise<void> {
    return this.sendEmpty(`/api/dispatch/orders/${orderId}/unassign`, 'POST');
  }

  suggestions(orderId: number): Promise<SuggestionDto[]> {
    return this.getJson(`/api/dispatch/orders/${orderId}/suggestions`);
  }

  optimization(driverId: number): Promise<OptimizationDto> {
    return this.getJson(`/api/dispatch/drivers/${driverId}/route/optimized`);
  }

  setDriverShift(driverId: number, onShift: boolean): Promise<DriverRouteDto> {
    return this.sendJson(`/api/dispatch/drivers/${driverId}/shift`, 'PUT', { onShift });
  }

  // ---------------------------------------------------------------- dispecer: lokali i nalozi

  restaurants(all = false): Promise<RestaurantDto[]> {
    return this.getJson(`/api/dispatch/restaurants${all ? '?all=true' : ''}`);
  }

  createRestaurant(body: RestaurantWriteDto): Promise<RestaurantDto> {
    return this.sendJson('/api/dispatch/restaurants', 'POST', body);
  }

  updateRestaurant(id: number, body: RestaurantWriteDto): Promise<RestaurantDto> {
    return this.sendJson(`/api/dispatch/restaurants/${id}`, 'PUT', body);
  }

  users(): Promise<UserDto[]> {
    return this.getJson('/api/dispatch/users');
  }

  createUser(body: UserCreateDto): Promise<UserDto> {
    return this.sendJson('/api/dispatch/users', 'POST', body);
  }

  updateUser(id: number, body: UserUpdateDto): Promise<UserDto> {
    return this.sendJson(`/api/dispatch/users/${id}`, 'PUT', body);
  }

  // ---------------------------------------------------------------- vozac

  driverRoute(): Promise<DriverRouteDto> {
    return this.getJson('/api/driver/route');
  }

  driverShift(onShift: boolean): Promise<DriverRouteDto> {
    return this.sendJson('/api/driver/shift', 'POST', { onShift });
  }

  driverLocation(latitude: number, longitude: number): Promise<void> {
    return this.sendEmpty('/api/driver/location', 'POST', { latitude, longitude });
  }

  driverAcknowledge(orderIds: number[]): Promise<DriverRouteDto> {
    return this.sendJson('/api/driver/orders/acknowledge', 'POST', { orderIds });
  }

  driverPickUp(orderIds: number[]): Promise<DriverRouteDto> {
    return this.sendJson('/api/driver/orders/pickup', 'POST', { orderIds });
  }

  driverDeliver(orderId: number): Promise<DriverRouteDto> {
    return this.sendJson(`/api/driver/orders/${orderId}/deliver`, 'POST', {});
  }

  driverProblem(orderId: number, reason: string): Promise<DriverRouteDto> {
    return this.sendJson(`/api/driver/orders/${orderId}/problem`, 'POST', { reason });
  }

  driverDay(): Promise<DriverDayDto> {
    return this.getJson('/api/driver/day');
  }

  // ---------------------------------------------------------------- geokodiranje (OpenStreetMap)

  async geocode(query: string): Promise<GeocodeResult | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const params = new URLSearchParams({ q: trimmed, format: 'jsonv2', limit: '1', countrycodes: 'rs' });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Pretraga adrese nije uspela (${response.status}).`);
    const payload = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const first = Array.isArray(payload) ? payload[0] : undefined;
    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);
    if (!first || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude, displayName: String(first.display_name ?? '') };
  }

  /** WebSocket adresa istog servera kao API. */
  webSocketUrl(): string {
    const base = this.apiBaseUrl || window.location.origin;
    return `${base.replace(/^http/i, 'ws')}/ws-native`;
  }

  // ---------------------------------------------------------------- HTTP

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.authFetch(path);
    if (!res.ok) await this.throwApiError(res);
    return (await res.json()) as T;
  }

  private async sendJson<T>(path: string, method: string, body: unknown): Promise<T> {
    const res = await this.authFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) await this.throwApiError(res);
    return (await this.readJsonSafe(res)) as T;
  }

  private async sendEmpty(path: string, method: string, body?: unknown): Promise<void> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await this.authFetch(path, init);
    if (!res.ok) await this.throwApiError(res);
  }

  /** Na 401 jednom osvezi token i ponovi zahtev; ako ni to ne uspe, korisnik je odjavljen. */
  private async authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const current = this.auth.snapshot;
    if (!current?.accessToken) throw new ApiError('Niste prijavljeni.', 401);
    const res = await this.apiFetch(path, this.withAuth(init, current.accessToken));
    if (res.status !== 401) return res;

    let refreshed: LoginResponse;
    try {
      refreshed = await this.refreshToken(current.refreshToken);
    } catch {
      this.auth.clearAuth();
      throw new ApiError('Sesija je istekla. Prijavi se ponovo.', 401);
    }
    this.auth.setAuth(refreshed);
    const retry = await this.apiFetch(path, this.withAuth(init, refreshed.accessToken));
    if (retry.status === 401) {
      this.auth.clearAuth();
      throw new ApiError('Sesija je istekla. Prijavi se ponovo.', 401);
    }
    return retry;
  }

  private async refreshToken(refreshToken: string): Promise<LoginResponse> {
    if (!refreshToken) throw new Error('Nema refresh tokena');
    const res = await this.apiFetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) throw new Error('Refresh token nije validan');
    return (await res.json()) as LoginResponse;
  }

  private withAuth(init: RequestInit, accessToken: string): RequestInit {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${accessToken}`);
    return { ...init, headers };
  }

  private apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = this.apiBaseUrl ? `${this.apiBaseUrl}${path}` : path;
    return fetch(url, init).catch(() => {
      throw new ApiError('Server nije dostupan. Proveri vezu.', 0);
    });
  }

  /** Adresa API-ja: prazno = isti server (dev proxy ili zajednicki domen). */
  private resolveApiBaseUrl(): string {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('DOSTAVA_API_BASE_URL');
    } catch {
      stored = null;
    }
    return (stored || environment.apiBaseUrl).trim().replace(/\/+$/, '');
  }

  private async throwApiError(response: Response): Promise<never> {
    const payload = await this.readJsonSafe(response);
    const record = payload && typeof payload === 'object' ? (payload as JsonRecord) : {};
    const detail = String(record['message'] ?? '').trim();
    const code = String(record['errorCode'] ?? '').trim();
    const fallback =
      response.status === 403
        ? 'Nemate dozvolu za ovu radnju.'
        : response.status === 404
          ? 'Nije pronadjeno.'
          : `Greska servera (${response.status}).`;
    throw new ApiError(detail || fallback, response.status, code || undefined);
  }

  private async readJsonSafe(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}
