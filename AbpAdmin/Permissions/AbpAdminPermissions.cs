namespace AbpAdmin.Permissions;

public static class AbpAdminPermissions
{
    public const string GroupName = "AbpAdmin";

    public static class AuditLogs
    {
        public const string Default = GroupName + ".AuditLogs";
    }

    public static class SecurityLogs
    {
        public const string Default = GroupName + ".SecurityLogs";
    }

    public static class IdentitySettings
    {
        public const string Default = GroupName + ".IdentitySettings";
    }

    public static class Applications
    {
        public const string Default = GroupName + ".Applications";
        public const string Create = Default + ".Create";
        public const string Update = Default + ".Update";
        public const string Delete = Default + ".Delete";
        /// <summary>Grant permissions to a client itself (provider "C"), e.g. for client_credentials backends.</summary>
        public const string ManagePermissions = Default + ".ManagePermissions";
    }

    public static class Scopes
    {
        public const string Default = GroupName + ".Scopes";
        public const string Create = Default + ".Create";
        public const string Update = Default + ".Update";
        public const string Delete = Default + ".Delete";
    }

    public static class OrganizationUnits
    {
        public const string Default = GroupName + ".OrganizationUnits";
        public const string ManageTree = Default + ".ManageTree";
        public const string ManageMembers = Default + ".ManageMembers";
        public const string ManageRoles = Default + ".ManageRoles";
    }

    public static class BackgroundJobs
    {
        public const string Default = GroupName + ".BackgroundJobs";
        public const string Manage = Default + ".Manage";
    }
}
