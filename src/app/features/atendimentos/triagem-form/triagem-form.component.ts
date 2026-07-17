import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AtendimentosService } from '../atendimentos.service';
import { MedicosService } from '../../medicos/medicos.service';
import { PacientesService } from '../../pacientes/pacientes.service';
import { Medico } from '../../../models/medico.model';
import { Paciente } from '../../../models/paciente.model';
import { RISCO_MANCHESTER_OPTIONS } from '../../../models/atendimento.model';
import { ToastService } from '../../../core/toast.service';

@Component({
  selector: 'app-triagem-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './triagem-form.component.html',
})
export class TriagemFormComponent implements OnInit {
  medicos   = signal<Medico[]>([]);
  pacientes = signal<Paciente[]>([]);
  riscos    = RISCO_MANCHESTER_OPTIONS;

  private fb          = inject(FormBuilder);
  private svc         = inject(AtendimentosService);
  private medicosSvc  = inject(MedicosService);
  private pacientesSvc= inject(PacientesService);
  private toast       = inject(ToastService);
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);

  form = this.fb.group({
    pacienteId:            ['', Validators.required],
    medicoTriagemId:       ['', Validators.required],
    dataHoraEntrada:       [new Date().toISOString().slice(0, 16), Validators.required],
    queixaPrincipal:       ['', Validators.required],
    classificacaoRisco:    ['', Validators.required],
    pressaoArterial:       [''],
    frequenciaCardiaca:    [null as number | null],
    saturacaoOxigenio:     [null as number | null],
    temperaturaCorporal:   [null as number | null],
    frequenciaRespiratoria:[null as number | null],
  });

  ngOnInit() {
    forkJoin({
      medicos:   this.medicosSvc.listarAtivos(),
      pacientes: this.pacientesSvc.listar(),
    }).subscribe(({ medicos, pacientes }) => {
      this.medicos.set(medicos);
      this.pacientes.set(pacientes);
    });

    const pacienteId = this.route.snapshot.queryParams['pacienteId'];
    if (pacienteId) this.form.patchValue({ pacienteId });
  }

  salvar() {
    if (this.form.invalid) return;
    const raw = this.form.value;
    const dto: any = {
      ...raw,
      dataHoraEntrada: new Date(raw.dataHoraEntrada!).toISOString(),
    };
    ['frequenciaCardiaca', 'saturacaoOxigenio', 'temperaturaCorporal', 'frequenciaRespiratoria']
      .forEach(k => { if (dto[k] === null || dto[k] === '') delete dto[k]; });

    this.svc.criar(dto).subscribe(a => {
      this.toast.success('Triagem registrada!');
      this.router.navigate(['/atendimentos', a.atendimentoId]);
    });
  }
}
