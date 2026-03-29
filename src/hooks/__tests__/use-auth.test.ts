import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuth } from "@/hooks/use-auth";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockSignInAction = vi.mocked(signInAction);
const mockSignUpAction = vi.mocked(signUpAction);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAnonWorkData.mockReturnValue(null);
});

describe("useAuth", () => {
  it("returns signIn, signUp, and isLoading", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.signIn).toBeTypeOf("function");
    expect(result.current.signUp).toBeTypeOf("function");
    expect(result.current.isLoading).toBe(false);
  });

  describe("signIn", () => {
    it("returns the result from signInAction on failure", async () => {
      const errorResult = { success: false, error: "Invalid credentials" };
      mockSignInAction.mockResolvedValue(errorResult);

      const { result } = renderHook(() => useAuth());

      let returnValue: any;
      await act(async () => {
        returnValue = await result.current.signIn("test@example.com", "wrong");
      });

      expect(mockSignInAction).toHaveBeenCalledWith(
        "test@example.com",
        "wrong"
      );
      expect(returnValue).toEqual(errorResult);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("sets isLoading to true during sign in and false after", async () => {
      let resolveSignIn!: (value: any) => void;
      mockSignInAction.mockReturnValue(
        new Promise((resolve) => {
          resolveSignIn = resolve;
        })
      );

      const { result } = renderHook(() => useAuth());

      expect(result.current.isLoading).toBe(false);

      let signInPromise: Promise<any>;
      act(() => {
        signInPromise = result.current.signIn("a@b.com", "password");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignIn({ success: false, error: "fail" });
        await signInPromise!;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("sets isLoading to false even when signInAction throws", async () => {
      mockSignInAction.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(
          result.current.signIn("a@b.com", "pass")
        ).rejects.toThrow("Network error");
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("navigates to anon work project on success with anon data", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "hello" }],
        fileSystemData: { "/": { type: "directory" } },
      });
      mockCreateProject.mockResolvedValue({
        id: "proj-anon-123",
        name: "Design",
        messages: "[]",
        data: "{}",
        userId: "u1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password123");
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "hello" }],
          data: { "/": { type: "directory" } },
        })
      );
      expect(mockClearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-anon-123");
      expect(mockGetProjects).not.toHaveBeenCalled();
    });

    it("navigates to most recent project when no anon work exists", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([
        {
          id: "proj-recent",
          name: "Recent",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "proj-old",
          name: "Old",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password123");
      });

      expect(mockPush).toHaveBeenCalledWith("/proj-recent");
      expect(mockCreateProject).not.toHaveBeenCalled();
    });

    it("creates a new project when no anon work and no existing projects", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({
        id: "proj-new-456",
        name: "New Design",
        messages: "[]",
        data: "{}",
        userId: "u1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password123");
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [],
          data: {},
        })
      );
      expect(mockPush).toHaveBeenCalledWith("/proj-new-456");
    });

    it("does not call handlePostSignIn on failed sign in", async () => {
      mockSignInAction.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "wrong");
      });

      expect(mockGetAnonWorkData).not.toHaveBeenCalled();
      expect(mockGetProjects).not.toHaveBeenCalled();
      expect(mockCreateProject).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("skips anon work when messages array is empty", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({
        messages: [],
        fileSystemData: {},
      });
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({
        id: "proj-fallback",
        name: "New",
        messages: "[]",
        data: "{}",
        userId: "u1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password123");
      });

      // Should have fallen through to the getProjects path
      expect(mockGetProjects).toHaveBeenCalled();
      expect(mockClearAnonWork).not.toHaveBeenCalled();
    });
  });

  describe("signUp", () => {
    it("returns the result from signUpAction on failure", async () => {
      const errorResult = {
        success: false,
        error: "Email already registered",
      };
      mockSignUpAction.mockResolvedValue(errorResult);

      const { result } = renderHook(() => useAuth());

      let returnValue: any;
      await act(async () => {
        returnValue = await result.current.signUp(
          "existing@example.com",
          "password123"
        );
      });

      expect(mockSignUpAction).toHaveBeenCalledWith(
        "existing@example.com",
        "password123"
      );
      expect(returnValue).toEqual(errorResult);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("sets isLoading to true during sign up and false after", async () => {
      let resolveSignUp!: (value: any) => void;
      mockSignUpAction.mockReturnValue(
        new Promise((resolve) => {
          resolveSignUp = resolve;
        })
      );

      const { result } = renderHook(() => useAuth());

      let signUpPromise: Promise<any>;
      act(() => {
        signUpPromise = result.current.signUp("a@b.com", "password");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignUp({ success: false, error: "fail" });
        await signUpPromise!;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("sets isLoading to false even when signUpAction throws", async () => {
      mockSignUpAction.mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(
          result.current.signUp("a@b.com", "pass")
        ).rejects.toThrow("Server error");
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("navigates to anon work project on success with anon data", async () => {
      mockSignUpAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "build a button" }],
        fileSystemData: { "/App.tsx": { content: "<button/>" } },
      });
      mockCreateProject.mockResolvedValue({
        id: "proj-signup-anon",
        name: "Design",
        messages: "[]",
        data: "{}",
        userId: "u1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(mockClearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-signup-anon");
    });

    it("navigates to most recent project when no anon work", async () => {
      mockSignUpAction.mockResolvedValue({ success: true });
      mockGetProjects.mockResolvedValue([
        {
          id: "proj-first",
          name: "First",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(mockPush).toHaveBeenCalledWith("/proj-first");
    });

    it("creates new project when no anon work and no existing projects", async () => {
      mockSignUpAction.mockResolvedValue({ success: true });
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({
        id: "proj-brand-new",
        name: "New Design",
        messages: "[]",
        data: "{}",
        userId: "u1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringMatching(/^New Design #\d+$/),
          messages: [],
          data: {},
        })
      );
      expect(mockPush).toHaveBeenCalledWith("/proj-brand-new");
    });

    it("does not call handlePostSignIn on failed sign up", async () => {
      mockSignUpAction.mockResolvedValue({
        success: false,
        error: "Email already registered",
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("existing@example.com", "password123");
      });

      expect(mockGetAnonWorkData).not.toHaveBeenCalled();
      expect(mockGetProjects).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
