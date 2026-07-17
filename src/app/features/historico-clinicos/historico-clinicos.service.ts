import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { HistoricoClinico } from '../../models/historico-clinico.model';

@Injectable({ providedIn: 'root' })
export class HistoricoClinicosService {
  constructor(private api: ApiService) {}

  listar()                    { return this.api.get<HistoricoClinico[]>('/historico-clinicos'); }
  // O backend retorna um único documento (ou null se o paciente ainda não tem triagem)
  porPaciente(pacienteId: string) { return this.api.get<HistoricoClinico | null>(`/historico-clinicos/paciente/${pacienteId}`); }
}
