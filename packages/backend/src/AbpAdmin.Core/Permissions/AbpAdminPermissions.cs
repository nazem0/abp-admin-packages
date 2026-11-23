namespace AbpAdmin.Permissions;

public static class AbpAdminPermissions
{
    public const string GroupName = "AbpAdmin";

    public static class AuditLogs
    {
        public const string Default = GroupName + ".AuditLogs";
        /// <summary>Host only: how long audit logs are kept, and deleting older ones.</summary>
        public const string ManageRetention = Default + ".ManageRetention";
    }

    /// <summary>Claim types are shared by all tenants: host only.</summary>
    public static class ClaimTypes
    {
        public const string Default = GroupName + ".ClaimTypes";
        public const string Create = Default + ".Create";
        public const string Update = Default + ".Update";
        public const string Delete = Default + ".Delete";
    }

    public static class SecurityLogs
    {
        public const string Default = GroupName + ".SecurityLogs";
    }

    /// <summary>Every setting definition of every module, at the host (global) or tenant level.</summary>
    public static class Settings
    {
        public const string Default = GroupName + ".Settings";
        public const string Update = Default + ".Update";
    }

    /// <summary>Clear permission, setting and feature caches (AbpAdmin.Identity).</summary>
    public static class Cache
    {
        public const string Default = GroupName + ".Cache";
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

    public static class Tenants
    {
        public const string Default = GroupName + ".Tenants";
        public const string Create = Default + ".Create";
        public const string Update = Default + ".Update";
        public const string Delete = Default + ".Delete";
        public const string ManageMultiTenancy = Default + ".ManageMultiTenancy";
        public const string ManageConnectionStrings = Default + ".ManageConnectionStrings";
        /// <summary>Host only: list users of every tenant and manage them inside their tenant.</summary>
        public const string ManageUsers = Default + ".ManageUsers";
        /// <summary>Host only: the features of a tenant (provider "T" with the tenant's id).</summary>
        public const string ManageFeatures = Default + ".ManageFeatures";
    }

    public static class BackgroundJobs
    {
        public const string Default = GroupName + ".BackgroundJobs";
        public const string Manage = Default + ".Manage";
    }

    /// <summary>Entity explorer; one child per exposed entity (EntityExplorerOptions), each with Create/Update/Delete.</summary>
    public static class Entities
    {
        public const string Default = GroupName + ".Entities";
        public static string Read(string entity) => Default + "." + entity;
        public static string Create(string entity) => Read(entity) + ".Create";
        public static string Update(string entity) => Read(entity) + ".Update";
        public static string Delete(string entity) => Read(entity) + ".Delete";
    }
}
