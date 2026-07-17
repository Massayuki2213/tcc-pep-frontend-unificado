export interface Alergia {
  substancia: string;
  severidade: 'leve' | 'moderada' | 'grave';
  reacao?: string;
}

export interface Comorbidade {
  descricao: string;
  cid10?: string;
  dataDiagnostico?: string;
  ativa: boolean;
}

export interface HistoricoClinico {
  _id: string;
  pacienteId: string;
  alergiasConhecidas: Alergia[];
  comorbidadesPrevias: Comorbidade[];
  criadoEm: string;
  atualizadoEm: string;
}
