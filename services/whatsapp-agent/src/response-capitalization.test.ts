import { describe, expect, it } from "vitest";
import { formatAssistantReply } from "./response-capitalization.js";

describe("formatAssistantReply", () => {
  it.each([
    "STANDARD",
    undefined,
    "unknown",
  ])("removes opening question marks while preserving case for %s", (capitalization) => {
    expect(
      formatAssistantReply(
        "Hola, ¿qué queso buscás?\n¿Querés Cremac o Las Tres?",
        capitalization
      )
    ).toBe("Hola, qué queso buscás?\nQuerés Cremac o Las Tres?");
  });

  it("removes opening question marks in lowercase mode without changing links, emails or codes", () => {
    expect(
      formatAssistantReply(
        "¿Querés el pedido PV-123? Consultá Ventas@Ejemplo.com o https://ejemplo.com/Pedido?ref=AB",
        "LOWERCASE"
      )
    ).toBe(
      "querés el pedido PV-123? consultá Ventas@Ejemplo.com o https://ejemplo.com/Pedido?ref=AB"
    );
  });

  it("can format a reply twice without changing it again", () => {
    const reply = formatAssistantReply(
      "¿Querés 2 piezas a $20 por kg?",
      "STANDARD"
    );
    expect(formatAssistantReply(reply, "STANDARD")).toBe(reply);
  });
});
