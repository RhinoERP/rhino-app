export class WarehouseAccessError extends Error {
  readonly status: 400 | 401 | 403 | 404;

  constructor(message: string, status: 400 | 401 | 403 | 404) {
    super(message);
    this.name = "WarehouseAccessError";
    this.status = status;
  }
}
