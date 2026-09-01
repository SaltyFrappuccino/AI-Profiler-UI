globalThis.AIProfilerArchitectureState = (() => {
  function connection(data = {}) {
    const runtime = data.runtime || {};
    const connected = data.available !== false
      && data.storage === "postgresql"
      && Boolean(runtime.server_version);
    if (connected) {
      return {
        connected: true,
        label: "Подключено",
        profileLabel: "Рабочий контур",
        className: "storage-live",
        description: "",
      };
    }
    if (data.unavailableReason === "postgresql_unreachable") {
      return {
        connected: false,
        label: "Нет соединения",
        profileLabel: "PostgreSQL недоступен",
        className: "storage-live is-offline",
        description: "PostgreSQL настроен, но сервер не отвечает. Проверьте строку подключения и состояние базы.",
      };
    }
    return {
      connected: false,
      label: "Не настроено",
      profileLabel: "Файловый профиль",
      className: "storage-live is-offline",
      description: "Интерфейс читает аналитический снимок из файлов. Физические таблицы, ограничения и размеры появятся после миграции и загрузки снимка в PostgreSQL.",
    };
  }

  return { connection };
})();
