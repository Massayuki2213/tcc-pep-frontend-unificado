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
