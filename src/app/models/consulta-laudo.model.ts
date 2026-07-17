export type TipoRegistro =
  | 'TRIAGEM'
  | 'CONSULTA'
  | 'LAUDO'
  | 'EVOLUCAO'
  | 'ALTA'
  | 'PRESCRICAO';

export type Severidade = 'leve' | 'moderada' | 'grave';

export interface Prescricao {
  medicamento: string;
  dose: string;
  frequencia: string;
  duracao?: string;
}

export interface ExameAnexo {
  tipo: string;
  descricao?: string;
  urlAnexo?: string;
  dataRealizacao?: string;
}

export interface NovaAlergia {
  substancia: string;
  severidade: Severidade;
  reacao?: string;
}

export interface ConsultaLaudo {
  _id: string;
  atendimentoId: string;
  historicoId: string;
  pacienteId: string;
  medicoId: string;
  dataRegistro: string;
  tipoRegistro: TipoRegistro;
  descricaoClinica: string;
  prescricoes?: Prescricao[];
  examesAnexos?: ExameAnexo[];
  novasAlergiasIdentificadas?: NovaAlergia[];
}

export interface CreateConsultaLaudoDto {
  atendimentoId: string;
  historicoId: string;
  pacienteId: string;
  medicoId: string;
  dataRegistro: string;
  tipoRegistro: TipoRegistro;
  descricaoClinica: string;
  prescricoes?: Prescricao[];
  examesAnexos?: ExameAnexo[];
  novasAlergiasIdentificadas?: NovaAlergia[];
}
