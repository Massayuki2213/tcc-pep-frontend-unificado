import { Atendimento } from './atendimento.model';
import { HistoricoClinico } from './historico-clinico.model';

export interface Paciente {
  id: string;
  nomeCompleto: string;
  sexo: string;
  dataNascimento: string;
  telefoneContato?: string;
  tipagemSanguinea?: string;
  consentimentoLgpd: boolean;
}

export interface CreatePacienteDto {
  nomeCompleto: string;
  sexo: string;
  cpf: string;
  dataNascimento: string;
  consentimentoLgpd: boolean;
  telefoneContato?: string;
  tipagemSanguinea?: string;
}

export type UpdatePacienteDto = Partial<Omit<CreatePacienteDto, 'cpf'>>;

/** GET /pacientes/:id/historico-completo — join poliglota (PG + MongoDB) */
export interface HistoricoCompletoResponse {
  paciente: Paciente;
  historicoClinico: HistoricoClinico | null;
  atendimentos: Atendimento[];
}
