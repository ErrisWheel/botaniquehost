import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DevelopersPage } from './developers.page';

describe('DevelopersPage', () => {
  let component: DevelopersPage;
  let fixture: ComponentFixture<DevelopersPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DevelopersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
