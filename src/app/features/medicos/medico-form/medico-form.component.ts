import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MedicosService } from '../medicos.service';
import { CreateMedicoDto } from '../../../models/medico.model';
import { ToastService } from '../../../core/toast.service';

@Component({
  selector: 'app-medico-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './medico-form.component.html',
})
export class MedicoFormComponent implements OnInit {
  editando = signal(false);
  private id?: string;
  private fb     = inject(FormBuilder);
  private svc    = inject(MedicosService);
  private toast  = inject(ToastService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  form = this.fb.group({
    nomeCompleto: ['', Validators.required],
    crm:          ['', Validators.required],
    especialidade:['', Validators.required],
    ativo:        [true],
  });

  ngOnInit() {
    this.id = this.route.snapshot.params['id'];
    if (this.id) {
      this.editando.set(true);
      this.svc.buscar(this.id).subscribe(m => this.form.patchValue(m));
    }
  }

  salvar() {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const dto: CreateMedicoDto = {
      nomeCompleto:  raw.nomeCompleto!,
      crm:           raw.crm!,
      especialidade: raw.especialidade!,
      ativo:         raw.ativo ?? true,
    };
    const req = this.editando()
      ? this.svc.atualizar(this.id!, dto)
      : this.svc.criar(dto);
    req.subscribe(() => {
      this.toast.success(this.editando() ? 'Médico atualizado!' : 'Médico cadastrado!');
      this.router.navigate(['/medicos']);
    });
  }
}
