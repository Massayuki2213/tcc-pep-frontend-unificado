import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { Atendimento, CreateAtendimentoDto, UpdateAtendimentoDto } from '../../models/atendimento.model';

@Injectable({ providedIn: 'root' })
export class AtendimentosService {
  constructor(private api: ApiService) {}

  listar()                                   { return this.api.get<Atendimento[]>('/atendimentos'); }
  buscar(id: string)                         { return this.api.get<Atendimento>(`/atendimentos/${id}`); }
  // POST /atendimentos retorna { success, atendimentoId }, não a entidade completa
  criar(dto: CreateAtendimentoDto)           { return this.api.post<{ success: boolean; atendimentoId: string }>('/atendimentos', dto); }
  atualizar(id: string, dto: UpdateAtendimentoDto) { return this.api.patch<Atendimento>(`/atendimentos/${id}`, dto); }
  remover(id: string)                        { return this.api.delete<any>(`/atendimentos/${id}`); }
}
