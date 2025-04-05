
import React, { createContext, useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthContextType, User } from "@/types";
import { supabase } from "@/integrations/supabase/client";

// Criando o contexto com um valor inicial undefined
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth listener first (importante para evitar race conditions)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          // Verifica se o usuário está ativo usando a nova função
          checkUserStatus(session.user.id, session.user.email).then(isActive => {
            if (isActive) {
              const userData: User = {
                id: session.user.id,
                usuario: session.user.email || session.user.user_metadata?.usuario || "usuário",
              };
              setUser(userData);
              localStorage.setItem("queueUser", JSON.stringify(userData));
            } else {
              // Se não estiver ativo, faz logout
              supabase.auth.signOut().then(() => {
                setUser(null);
                localStorage.removeItem("queueUser");
                toast.error("Sua conta está aguardando aprovação do administrador");
                navigate("/login");
              });
            }
          });
        } else {
          setUser(null);
          localStorage.removeItem("queueUser");
        }
        setIsLoading(false);
      }
    );

    // Verifica se existe uma sessão do Supabase e configura o usuário
    const checkSession = async () => {
      setIsLoading(true);
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error("Erro ao verificar sessão:", error.message);
      }
      
      if (session?.user) {
        // Verifica se o usuário está ativo usando a nova função
        const isActive = await checkUserStatus(session.user.id, session.user.email);
        
        if (isActive) {
          const userData: User = {
            id: session.user.id,
            usuario: session.user.email || session.user.user_metadata?.usuario || "usuário",
          };
          setUser(userData);
          localStorage.setItem("queueUser", JSON.stringify(userData));
        } else {
          await supabase.auth.signOut();
          setUser(null);
          localStorage.removeItem("queueUser");
          toast.error("Sua conta está aguardando aprovação do administrador");
          navigate("/login");
        }
      } else {
        setUser(null);
        localStorage.removeItem("queueUser");
      }
      
      setIsLoading(false);
    };

    // Verifica a sessão ao carregar
    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Função para verificar se o usuário está ativo usando a nova função SQL
  const checkUserStatus = async (userId: string, email: string | undefined): Promise<boolean> => {
    try {
      if (!email) return false;
      
      // Usa a nova função check_user_active para verificar se o usuário está ativo
      const { data, error } = await supabase
        .rpc('check_user_active', { email });
      
      if (error) {
        console.error("Erro ao verificar status do usuário:", error.message);
        return false;
      }
      
      return data === true;
    } catch (error) {
      console.error("Erro ao verificar status do usuário:", error);
      return false;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      // Primeiro verifica se o usuário está ativo usando a função SQL
      const { data: isActive, error: checkError } = await supabase
        .rpc('check_user_active', { email });
      
      if (checkError) {
        console.error("Erro ao verificar status do usuário:", checkError);
        toast.error("Erro ao verificar status da conta");
        return;
      }
      
      if (!isActive) {
        toast.error("Sua conta está aguardando aprovação do administrador");
        return;
      }
      
      // Se estiver ativo, tenta fazer login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message || "Erro ao fazer login");
        return;
      }

      if (data.user) {
        const userData: User = {
          id: data.user.id,
          usuario: data.user.email || data.user.user_metadata?.usuario || "usuário",
        };
        setUser(userData);
        localStorage.setItem("queueUser", JSON.stringify(userData));
        toast.success("Login realizado com sucesso");
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Erro de login:", error);
      toast.error("Erro de autenticação");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem("queueUser");
      setUser(null);
      navigate("/login");
      toast.info("Logout realizado com sucesso");
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      toast.error("Erro ao fazer logout");
    }
  };

  // Valor do contexto que será disponibilizado
  const contextValue: AuthContextType = {
    user,
    login,
    logout,
    isLoading,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook personalizado para acessar o contexto
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
};
