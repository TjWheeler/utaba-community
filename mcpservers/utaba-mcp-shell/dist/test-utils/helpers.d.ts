import { Config } from '../config';
import { Logger } from '../logger';
/**
 * Test utilities for mocking and setup
 */
export declare function setupTests(): void;
export declare function createMockConfig(overrides?: Partial<Config>): Config;
export declare function createMockLogger(): Logger;
export declare function createMockChildProcess(): {
    pid: number;
    stdout: {
        on: import("vitest").Mock<(...args: any[]) => any>;
    };
    stderr: {
        on: import("vitest").Mock<(...args: any[]) => any>;
    };
    on: import("vitest").Mock<(...args: any[]) => any>;
    kill: import("vitest").Mock<(...args: any[]) => any>;
    spawnargs: string[];
};
export declare function mockSuccessfulCommand(stdout?: string, stderr?: string, exitCode?: number): {
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTime: number;
    timedOut: boolean;
    killed: boolean;
    pid: number;
};
export declare function mockFailedCommand(exitCode?: number, stderr?: string, stdout?: string): {
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTime: number;
    timedOut: boolean;
    killed: boolean;
    pid: number;
};
export declare function mockTimedOutCommand(stdout?: string, stderr?: string): {
    exitCode: null;
    stdout: string;
    stderr: string;
    executionTime: number;
    timedOut: boolean;
    killed: boolean;
    pid: number;
};
export declare function createTempTestFile(content: string): Promise<string>;
export declare function cleanupTempFile(filePath: string): Promise<void>;
export declare const DANGEROUS_COMMAND_PATTERNS: string[];
export declare const SAFE_COMMAND_PATTERNS: string[];
export declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T>;
export declare function withEnvironmentVariable(name: string, value: string, fn: () => Promise<void>): Promise<void>;
export declare function withTempDirectory<T>(fn: (tempDir: string) => Promise<T>): Promise<T>;
export declare function measureExecutionTime<T>(fn: () => Promise<T>): Promise<{
    result: T;
    duration: number;
}>;
export declare function assertValidCommandResult(result: any): void;
export declare function assertSecurityError(error: any, expectedReason?: string): void;
export declare function createMockMCPRequest(toolName: string, args: any): {
    params: {
        name: string;
        arguments: any;
    };
};
export declare function extractMCPResponseText(response: any): string;
export declare function parseMCPResponseJSON(response: any): any;
//# sourceMappingURL=helpers.d.ts.map