export class MeliConfirmationError extends Error {
  readonly canEdit: boolean;
  constructor(message: string, canEdit: boolean) {
    super(message);
    this.name = "MeliConfirmationError";
    this.canEdit = canEdit;
  }
}
