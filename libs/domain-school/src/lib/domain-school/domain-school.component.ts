import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'school-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './domain-school.component.html',
  styleUrl: './domain-school.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DomainSchoolComponent {}
