import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { Medico, CreateMedicoDto, UpdateMedicoDto, MedicoAtendimentosResponse, MedicoLaudosResponse } from '../../models/medico.model';

@Injectable({ providedIn: 'root' })
export class MedicosService {
  constructor(private api: ApiService) {}

  listar()                          { return this.api.get<Medico[]>('/medicos'); }
  listarAtivos()                    { return this.api.get<Medico[]>('/medicos/ativos'); }
  buscar(id: string)                { return this.api.get<Medico>(`/medicos/${id}`); }
  criar(dto: CreateMedicoDto)       { return this.api.post<Medico>('/medicos', dto); }
  atualizar(id: string, dto: UpdateMedicoDto) { return this.api.patch<Medico>(`/medicos/${id}`, dto); }
  getAtendimentos(id: string)       { return this.api.get<MedicoAtendimentosResponse>(`/medicos/${id}/atendimentos`); }
  getLaudos(id: string)             { return this.api.get<MedicoLaudosResponse>(`/medicos/${id}/laudos`); }
  remover(id: string)               { return this.api.delete<void>(`/medicos/${id}`); }
}
