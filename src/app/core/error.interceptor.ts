import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from './toast.service';

/** Requisições com este token não disparam toast de erro (ex.: polling do orquestrador). */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/**
 * O HttpExceptionFilter do backend envia `error` em três formatos:
 *   404/409 → objeto { message: string, error, statusCode }
 *   400     → objeto { message: string[] } (uma entrada por campo inválido)
 *   500     → string "Erro interno do servidor"
 */
function extrairMensagem(body: any, status: number | undefined): string {
  const e = body?.error;
  if (typeof e === 'string') return e;
  if (Array.isArray(e?.message)) return e.message.join('; ');
  if (typeof e?.message === 'string') return e.message;
  return `Erro ${status ?? 'desconhecido'}`;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError(err => {
      const msg = extrairMensagem(err.error, err.status);
      if (!req.context.get(SKIP_ERROR_TOAST)) toast.error(msg);
      return throwError(() => new Error(msg));
    }),
  );
};
