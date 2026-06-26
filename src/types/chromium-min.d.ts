declare module "@sparticuz/chromium-min" {
  const chromium: {
    args: string[];
    executablePath: (input?: string) => Promise<string>;
  };

  export default chromium;
}
