import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<Toast[]>([]);
  private next = 0;

  success(message: string) { this.add(message, 'success'); }
  error(message: string)   { this.add(message, 'error'); }
  info(message: string)    { this.add(message, 'info'); }

  private add(message: string, type: Toast['type']) {
    const id = ++this.next;
    this.toasts.update(list => [...list, { id, message, type }]);
    setTimeout(() => this.remove(id), 4000);
  }

  remove(id: number) {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }
}
