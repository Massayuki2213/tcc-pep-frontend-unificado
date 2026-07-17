import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { ConsultaLaudo, CreateConsultaLaudoDto } from '../../models/consulta-laudo.model';

@Injectable({ providedIn: 'root' })
export class ConsultasLaudosService {
  constructor(private api: ApiService) {}

  listar()                           { return this.api.get<ConsultaLaudo[]>('/consultas-laudos'); }
  criar(dto: CreateConsultaLaudoDto) { return this.api.post<ConsultaLaudo>('/consultas-laudos', dto); }
  porAtendimento(atendimentoId: string) { return this.api.get<ConsultaLaudo[]>(`/consultas-laudos/atendimento/${atendimentoId}`); }
  porPaciente(pacienteId: string)    { return this.api.get<ConsultaLaudo[]>(`/consultas-laudos/paciente/${pacienteId}`); }
}
