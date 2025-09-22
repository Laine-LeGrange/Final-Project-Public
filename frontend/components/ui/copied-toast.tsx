function CopiedToast({ visible }: { visible: boolean }) {
  return (
    <div
      className={`fixed bottom-20 right-6 px-3 py-2 rounded-md bg-black text-white text-sm transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      Copied to clipboard!
    </div>
  );
}
