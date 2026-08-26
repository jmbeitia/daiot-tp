import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';

const TOKEN_KEY = 'auth_token';
const API = (window as any).__API_URL__ ?? 'http://localhost:3000/api';

interface LoginResponse {
  token: string;
}

interface JwtPayload {
  sub: number;
  nombre: string;
  rol: string;
  exp: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  login(email: string, password: string) {
    return this.http
      .post<LoginResponse>(`${API}/auth/login`, { email, password })
      .pipe(tap((res) => localStorage.setItem(TOKEN_KEY, res.token)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private decodePayload(): JwtPayload | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      return JSON.parse(decodeURIComponent(atob(token.split('.')[1]).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join(''))) as JwtPayload;
    } catch {
      return null;
    }
  }

  getRol(): string | null {
    return this.decodePayload()?.rol ?? null;
  }

  getNombre(): string | null {
    return this.decodePayload()?.nombre ?? null;
  }

  getId(): number | null {
    return this.decodePayload()?.sub ?? null;
  }

  isLoggedIn(): boolean {
    const payload = this.decodePayload();
    if (!payload) return false;
    return payload.exp * 1000 > Date.now();
  }
}
