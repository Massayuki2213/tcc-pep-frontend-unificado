import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { Paciente, CreatePacienteDto, UpdatePacienteDto, HistoricoCompletoResponse } from '../../models/paciente.model';

@Injectable({ providedIn: 'root' })
export class PacientesService {
  private api = inject(ApiService);

  listar()                             { return this.api.get<Paciente[]>('/pacientes'); }
  buscar(id: string)                   { return this.api.get<Paciente>(`/pacientes/${id}`); }
  historicoCompleto(id: string)        { return this.api.get<HistoricoCompletoResponse>(`/pacientes/${id}/historico-completo`); }
  criar(dto: CreatePacienteDto)        { return this.api.post<Paciente>('/pacientes', dto); }
  atualizar(id: string, dto: UpdatePacienteDto) { return this.api.patch<Paciente>(`/pacientes/${id}`, dto); }
  remover(id: string)                  { return this.api.delete<void>(`/pacientes/${id}`); }
}
