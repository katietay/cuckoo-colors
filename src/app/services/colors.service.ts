import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Color {
  id: number;
  name: string;
  hex: string;
  /** 'visitor' colors were added by a visitor and expire. Missing means an admin color. */
  source?: 'admin' | 'visitor';
  /** Unix time in seconds when a visitor color is removed. */
  expiresAt?: number | null;
}

export interface VisitorLimits {
  maxColors: number;
  perDay: number;
  expireSeconds: number;
  nameMin: number;
  nameMax: number;
}

export interface ServerConfig {
  editingEnabled: boolean;
  minColors: number;
  maxColors: number;
  /** True when visitors may add colors without the admin key. */
  publicAdding?: boolean;
  /** Where to send suggestions when the visitor list is full. */
  contactEmail?: string;
  visitorLimits?: VisitorLimits;
}

/** Turn an HTTP error into a message that is safe and useful to show. */
export function describeHttpError(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 401) return 'The admin key is missing or incorrect.';
    if (err.status === 503) return 'Editing is disabled on this server.';
    const message = (err.error as { error?: unknown } | null)?.error;
    if (typeof message === 'string' && message.length > 0) return message;
    if (err.status === 429) return 'Too many requests. Please wait a few minutes and try again.';
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class ColorService {
  /**
   * Same-origin API, relative to <base href>, so the app works at the site root
   * or in a subfolder. In development, `ng serve` proxies /api to the Node server.
   */
  private readonly apiUrl = 'api/colors';
  private readonly configUrl = 'api/config';

  /** Held in memory only. It is never written to storage. */
  private adminKey = '';

  constructor(private http: HttpClient) {}

  setAdminKey(key: string): void {
    this.adminKey = key.trim();
  }

  hasAdminKey(): boolean {
    return this.adminKey.length > 0;
  }

  getConfig(): Observable<ServerConfig> {
    return this.http.get<ServerConfig>(this.configUrl);
  }

  getColors(): Observable<Color[]> {
    return this.http.get<Color[]>(this.apiUrl);
  }

  addColor(color: Pick<Color, 'name' | 'hex'>): Observable<Color> {
    return this.http.post<Color>(this.apiUrl, color, { headers: this.authHeaders() });
  }

  updateColor(color: Color): Observable<Color> {
    return this.http.put<Color>(
      `${this.apiUrl}/${encodeURIComponent(color.id)}`,
      { name: color.name, hex: color.hex },
      { headers: this.authHeaders() },
    );
  }

  deleteColor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(id)}`, {
      headers: this.authHeaders(),
    });
  }

  private authHeaders(): HttpHeaders {
    return this.adminKey ? new HttpHeaders({ 'X-Admin-Key': this.adminKey }) : new HttpHeaders();
  }
}
