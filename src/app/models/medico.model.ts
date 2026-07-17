import { Atendimento } from './atendimento.model';
import { ConsultaLaudo } from './consulta-laudo.model';

export interface Medico {
  id: string;
  nomeCompleto: string;
  crm: string;
  especialidade: string;
  ativo: boolean;
}

export interface CreateMedicoDto {
  nomeCompleto: string;
  crm: string;
  especialidade: string;
  ativo?: boolean;
}

export type UpdateMedicoDto = Partial<CreateMedicoDto>;

/** GET /medicos/:id/atendimentos — join poliglota (PG → MDB) */
export interface MedicoAtendimentosResponse {
  medico: Medico;
  atendimentos: Atendimento[];
}

/** GET /medicos/:id/laudos — join poliglota (MDB → PG) */
export interface MedicoLaudosResponse {
  medico: Medico;
  laudos: ConsultaLaudo[];
  atendimentos: Atendimento[];
}
