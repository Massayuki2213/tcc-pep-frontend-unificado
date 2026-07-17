import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { LogAuditoria } from '../../models/log-auditoria.model';

@Injectable({ providedIn: 'root' })
export class LogsAuditoriaService {
  private api = inject(ApiService);

  listar()                         { return this.api.get<LogAuditoria[]>('/logs-auditoria'); }
  buscar(id: string)               { return this.api.get<LogAuditoria>(`/logs-auditoria/${id}`); }
  porAtendimento(atendimentoId: string) { return this.api.get<LogAuditoria[]>(`/logs-auditoria/atendimento/${atendimentoId}`); }
  porEntidade(entidade: string, entidadeId: string) { return this.api.get<LogAuditoria[]>(`/logs-auditoria/entidade/${entidade}/${entidadeId}`); }
}
