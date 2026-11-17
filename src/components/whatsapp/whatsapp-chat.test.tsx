import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ChangeEvent, ComponentProps, KeyboardEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InboxDetail } from "@/modules/whatsapp/inbox-contract";
import { WhatsAppChat } from "./whatsapp-chat";
import type { WhatsAppDraft } from "./whatsapp-inbox-client";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  textarea: vi.fn(),
  effects: [] as (() => undefined | (() => void))[],
}));

vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useEffect: (effect: () => undefined | (() => void)) => {
      mocks.effects.push(effect);
    },
  };
});
vi.mock("@/components/ui/textarea", () => ({ Textarea: mocks.textarea }));
vi.mock("./whatsapp-chat-controls", () => ({ WhatsAppChatHeader: () => null }));
vi.mock("./whatsapp-customer-link", () => ({
  WhatsAppCustomerLink: () => null,
}));
vi.mock("./whatsapp-timeline", () => ({ WhatsAppTimeline: () => null }));
vi.mock(
  "@/modules/whatsapp/actions/send-whatsapp-manual-message.action",
  () => ({
    sendWhatsAppManualMessageAction: mocks.send,
  })
);
vi.mock(
  "@/modules/whatsapp/actions/control-whatsapp-conversation.action",
  () => ({
    controlWhatsAppConversationAction: vi.fn(),
  })
);
vi.mock("@/modules/whatsapp/actions/review-whatsapp-delivery.action", () => ({
  reviewWhatsAppDeliveryAction: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.effects = [];
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

function renderChat(draft: WhatsAppDraft = { text: "Hola" }) {
  const effectStart = mocks.effects.length;
  const client = new QueryClient();
  const key = ["whatsapp-inbox", "prueba", "actor", "/chat"];
  client.setQueryData([...key, "detail"], {
    id: "chat",
    status: "HANDOFF",
    humanClaimedAt: new Date().toISOString(),
    assignedUserId: "actor",
    canManage: true,
    canSend: true,
    controlVersion: 1,
    windowEndsAt: new Date(Date.now() + 60_000).toISOString(),
  } satisfies Partial<InboxDetail>);
  const onDraft = vi.fn();
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <WhatsAppChat
        currentUserId="actor"
        draft={draft}
        listKey={["list"]}
        onBack={vi.fn()}
        onDraft={onDraft}
        orgSlug="prueba"
        url="/chat"
      />
    </QueryClientProvider>
  );
  const textarea = mocks.textarea.mock
    .lastCall?.[0] as ComponentProps<"textarea">;
  const cleanups = mocks.effects.slice(effectStart).map((effect) => effect());
  return {
    onDraft,
    changeText: (text: string) =>
      textarea.onChange?.({
        target: { value: text },
      } as ChangeEvent<HTMLTextAreaElement>),
    keydown: (input: Partial<KeyboardEvent<HTMLTextAreaElement>> = {}) =>
      textarea.onKeyDown?.({
        key: "Enter",
        nativeEvent: { isComposing: false },
        preventDefault: vi.fn(),
        ...input,
      } as KeyboardEvent<HTMLTextAreaElement>),
    unmount: () => {
      for (const cleanup of cleanups) {
        cleanup?.();
      }
      client.clear();
    },
  };
}

it("does not let a late accepted send erase a draft after leaving the chat", async () => {
  let accept!: (result: { success: true }) => void;
  mocks.send.mockReturnValue(
    new Promise((resolve) => {
      accept = resolve;
    })
  );
  const chat = renderChat();
  chat.keydown();
  expect(chat.onDraft).toHaveBeenCalledTimes(1);
  chat.unmount();
  accept({ success: true });
  await vi.waitFor(() => expect(mocks.send).toHaveResolved());
  expect(chat.onDraft).toHaveBeenCalledTimes(1);
  expect(chat.onDraft).toHaveBeenLastCalledWith(
    expect.objectContaining({ text: "Hola", attempt: expect.any(Object) })
  );
});

it("preserves an uncertain request identity when editing spaces and reopening the chat", () => {
  const attempt = {
    text: "Hola",
    clientRequestId: crypto.randomUUID(),
    expectedControlVersion: 0,
  };
  const chat = renderChat({ text: "Hola", attempt });
  chat.changeText("  Hola\n");
  expect(chat.onDraft).toHaveBeenLastCalledWith({ text: "  Hola\n", attempt });
  chat.unmount();
  mocks.send.mockResolvedValue({ success: false });
  const reopened = renderChat(chat.onDraft.mock.lastCall?.[0]);
  reopened.keydown();
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining(attempt));
  reopened.unmount();
});

it("accepts only one command for repeated Enter while a send is pending", () => {
  mocks.send.mockReturnValue(new Promise(vi.fn()));
  const chat = renderChat();
  chat.keydown();
  chat.keydown();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  chat.unmount();
});

it.each([
  { shiftKey: true },
  { nativeEvent: { isComposing: true } },
  { keyCode: 229 },
])("does not send on newline or keyboard composition: %j", (event) => {
  const chat = renderChat();
  chat.keydown(event as Partial<KeyboardEvent<HTMLTextAreaElement>>);
  expect(mocks.send).not.toHaveBeenCalled();
  chat.unmount();
});

it.each(["", "   \n "])("does not send blank text: %j", (text) => {
  const chat = renderChat({ text });
  chat.keydown();
  expect(mocks.send).not.toHaveBeenCalled();
  chat.unmount();
});
