export type RiscoManchester =
  | 'VERMELHO'
  | 'LARANJA'
  | 'AMARELO'
  | 'VERDE'
  | 'AZUL';

export const RISCO_MANCHESTER_OPTIONS: { value: RiscoManchester; label: string; cor: string }[] = [
  { value: 'VERMELHO', label: 'Vermelho — Imediato',      cor: '#e53e3e' },
  { value: 'LARANJA',  label: 'Laranja — Muito urgente',  cor: '#dd6b20' },
  { value: 'AMARELO',  label: 'Amarelo — Urgente',        cor: '#d69e2e' },
  { value: 'VERDE',    label: 'Verde — Pouco urgente',    cor: '#38a169' },
  { value: 'AZUL',     label: 'Azul — Não urgente',       cor: '#3182ce' },
];

export interface Atendimento {
  id: string;
  pacienteId: string;
  medicoTriagemId: string;
  dataHoraEntrada: string;
  queixaPrincipal: string;
  classificacaoRisco: RiscoManchester;
  pressaoArterial?: string;
  frequenciaCardiaca?: number;
  saturacaoOxigenio?: number;
  temperaturaCorporal?: number;
  frequenciaRespiratoria?: number;
  consultasLaudos?: any[];
}

export interface CreateAtendimentoDto {
  pacienteId: string;
  medicoTriagemId: string;
  dataHoraEntrada: string;
  queixaPrincipal: string;
  classificacaoRisco: RiscoManchester;
  pressaoArterial?: string;
  frequenciaCardiaca?: number;
  saturacaoOxigenio?: number;
  temperaturaCorporal?: number;
  frequenciaRespiratoria?: number;
}

export type UpdateAtendimentoDto = Partial<CreateAtendimentoDto>;
