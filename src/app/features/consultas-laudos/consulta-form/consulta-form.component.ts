import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormArray, Validators } from '@angular/forms';
import { ConsultasLaudosService } from '../consultas-laudos.service';
import { HistoricoClinicosService } from '../../historico-clinicos/historico-clinicos.service';
import { MedicosService } from '../../medicos/medicos.service';
import { Medico } from '../../../models/medico.model';
import { ToastService } from '../../../core/toast.service';

const TIPOS = ['TRIAGEM','CONSULTA','LAUDO','EVOLUCAO','ALTA','PRESCRICAO'];

@Component({
  selector: 'app-consulta-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './consulta-form.component.html',
})
export class ConsultaFormComponent implements OnInit {
  medicos  = signal<Medico[]>([]);
  tipos    = TIPOS;
  private atendimentoId!: string;
  private pacienteId!: string;
  private historicoId?: string;

  private fb           = inject(FormBuilder);
  private svc          = inject(ConsultasLaudosService);
  private historicoSvc = inject(HistoricoClinicosService);
  private medicosSvc   = inject(MedicosService);
  private toast        = inject(ToastService);
  private route        = inject(ActivatedRoute);
  private router       = inject(Router);

  form = this.fb.group({
    medicoId:         ['', Validators.required],
    tipoRegistro:     ['CONSULTA', Validators.required],
    dataRegistro:     [new Date().toISOString().slice(0, 16), Validators.required],
    descricaoClinica: ['', Validators.required],
    prescricoes:      this.fb.array([]),
    examesAnexos:     this.fb.array([]),
    novasAlergias:    this.fb.array([]),
  });

  get prescricoes()  { return this.form.get('prescricoes') as FormArray; }
  get examesAnexos() { return this.form.get('examesAnexos') as FormArray; }
  get novasAlergias(){ return this.form.get('novasAlergias') as FormArray; }

  ngOnInit() {
    this.atendimentoId = this.route.snapshot.queryParams['atendimentoId'];
    this.pacienteId    = this.route.snapshot.queryParams['pacienteId'];

    if (!this.atendimentoId || !this.pacienteId) {
      this.toast.error('Abra este formulário a partir de um atendimento.');
      this.router.navigate(['/atendimentos']);
      return;
    }

    this.medicosSvc.listarAtivos().subscribe(m => this.medicos.set(m));
    this.historicoSvc.porPaciente(this.pacienteId).subscribe(historico => {
      this.historicoId = historico?._id;
      if (!this.historicoId) {
        this.toast.error('Paciente sem histórico clínico — registre uma triagem primeiro.');
      }
    });
  }

  adicionarPrescricao() {
    this.prescricoes.push(this.fb.group({
      medicamento: ['', Validators.required],
      dose:        ['', Validators.required],
      frequencia:  ['', Validators.required],
      duracao:     [''],
    }));
  }

  removerPrescricao(i: number) { this.prescricoes.removeAt(i); }

  adicionarExame() {
    this.examesAnexos.push(this.fb.group({
      tipo:            ['', Validators.required],
      descricao:       [''],
      urlAnexo:        [null],
      dataRealizacao:  [''],
    }));
  }

  removerExame(i: number) { this.examesAnexos.removeAt(i); }

  adicionarAlergia() {
    this.novasAlergias.push(this.fb.group({
      substancia: ['', Validators.required],
      severidade: ['leve', Validators.required],
      reacao:     [''],
    }));
  }

  removerAlergia(i: number) { this.novasAlergias.removeAt(i); }

  salvar() {
    if (this.form.invalid) return;
    if (!this.historicoId) {
      this.toast.error('Histórico clínico ainda não carregado — aguarde ou registre uma triagem.');
      return;
    }
    const raw = this.form.value;
    const dto: any = {
      atendimentoId:   this.atendimentoId,
      historicoId:     this.historicoId,
      pacienteId:      this.pacienteId,
      medicoId:        raw.medicoId,
      tipoRegistro:    raw.tipoRegistro,
      dataRegistro:    new Date(raw.dataRegistro!).toISOString(),
      descricaoClinica: raw.descricaoClinica,
    };
    if (raw.prescricoes?.length)   dto.prescricoes = raw.prescricoes;
    if (raw.examesAnexos?.length)  dto.examesAnexos = (raw.examesAnexos as any[]).map((e: any) => ({
      ...e,
      dataRealizacao: e.dataRealizacao || undefined,
    }));
    if (raw.novasAlergias?.length) dto.novasAlergiasIdentificadas = raw.novasAlergias;

    this.svc.criar(dto).subscribe(() => {
      this.toast.success('Registro clínico salvo!');
      this.router.navigate(['/atendimentos', this.atendimentoId]);
    });
  }
}
