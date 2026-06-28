import * as vscode from 'vscode';

export class Logger {
  private readonly channel: vscode.OutputChannel;

  constructor(name: string) {
    this.channel = vscode.window.createOutputChannel(name);
  }

  info(message: string): void {
    this.write('INFO', message);
  }

  warn(message: string): void {
    this.write('WARN', message);
  }

  error(message: string): void {
    this.write('ERROR', message);
  }

  debug(message: string): void {
    this.write('DEBUG', message);
  }

  private write(level: string, message: string): void {
    this.channel.appendLine(`[${level}] ${message}`);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
