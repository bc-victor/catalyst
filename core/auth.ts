import { cookies } from 'next/headers';
import NextAuth, { type DefaultSession, type NextAuthConfig } from 'next-auth';
import axios from 'axios'
import 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import { z } from 'zod';

import { client } from './client';
import { graphql } from './client/graphql';

type B2bButtonType = {
  classSelector: string;
  color: string;
  customCss: string;
  enabled: boolean;
  locationSelector: string;
  text: string;
};

export enum CallbackKey {
  onQuoteCreate = 'on-quote-create',
  onAddToShoppingList = 'on-add-to-shopping-list',
  onClickCartButton = 'on-click-cart-button',
}

type CallbackEvent = {
  data: any;
  preventDefault: () => void;
};

const LoginMutation = graphql(`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      customer {
        entityId
        firstName
        lastName
        email
      }
    }
  }
`);

const AssignCartToCustomerMutation = graphql(`
  mutation AssignCartToCustomer($assignCartToCustomerInput: AssignCartToCustomerInput!) {
    cart {
      assignCartToCustomer(input: $assignCartToCustomerInput) {
        cart {
          entityId
        }
      }
    }
  }
`);

const UnassignCartFromCustomerMutation = graphql(`
  mutation UnassignCartFromCustomer(
    $unassignCartFromCustomerInput: UnassignCartFromCustomerInput!
  ) {
    cart {
      unassignCartFromCustomer(input: $unassignCartFromCustomerInput) {
        cart {
          entityId
        }
      }
    }
  }
`);

export const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const config = {
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt: ({ token, user }) => {
      // user can actually be undefined
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (user?.id) {
        token.id = user.id;
      }

      return token;
    },
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id;
      }

      return session;
    },
  },
  events: {
    async signIn({ user }) {
      const cookieStore = await cookies();
      const cookieCartId = cookieStore.get('cartId')?.value;
      const token = cookieStore.get('authjs.csrf-token')
      const response = await axios.post("https://b2b-tunnel.bundleb2b.net:9005/api/io/auth/customers/storefront", {
        channelId: process.env.BIGCOMMERCE_CHANNEL_ID, customerId: user.id, customerAccessToken: token
    })
    console.log('response', response.data)
      

      if (cookieCartId && user.id) {
        try {
          await client.fetch({
            document: AssignCartToCustomerMutation,
            variables: {
              assignCartToCustomerInput: {
                cartEntityId: cookieCartId,
              },
            },
            customerId: user.id,
            fetchOptions: {
              cache: 'no-store',
            },
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(error);
        }
      }
    },
    async signOut(message) {
      const cookieStore = await cookies();
      const cookieCartId = cookieStore.get('cartId')?.value;

      const customerId = 'token' in message ? message.token?.id : null;

      if (customerId && cookieCartId) {
        try {
          await client.fetch({
            document: UnassignCartFromCustomerMutation,
            variables: {
              unassignCartFromCustomerInput: {
                cartEntityId: cookieCartId,
              },
            },
            customerId,
            fetchOptions: {
              cache: 'no-store',
            },
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(error);
        }
      }
    },
  },
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const { email, password } = Credentials.parse(credentials);

        const response = await client.fetch({
          document: LoginMutation,
          variables: { email, password },
          fetchOptions: {
            cache: 'no-store',
          },
        });

        const result = response.data.login;

        if (!result.customer) {
          return null;
        }

        return {
          id: result.customer.entityId.toString(),
          name: `${result.customer.firstName} ${result.customer.lastName}`,
          email: result.customer.email,
        };
      },
    }),
  ],
} satisfies NextAuthConfig;

const { handlers, auth, signIn, signOut } = NextAuth(config);

const getSessionCustomerId = async () => {
  try {
    const session = await auth();

    return session?.user.id;
  } catch {
    // No empty
  }
};

export { handlers, auth, signIn, signOut, getSessionCustomerId };

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    name?: string | null;
    email?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
  }
}

declare global {
  interface Window {
    b2b: {
      eventQueue: { event: string; callback: (data: any) => void }[];
      initializationEnvironment: { isInit: boolean };
      callbacks: {
        addEventListener: (key: CallbackKey, callback: (event: CallbackEvent) => void) => void;
      };
      utils: {
        user: {
          getProfile: () => { role: number };
        };
        openPage: (pageId: string) => void;
        quote: {
          getButtonInfo: () => B2bButtonType;
          addProductFromPage: (item: any) => Promise<void>;
          addProductsFromCart: () => Promise<void>;
          getButtonInfoAddAllFromCartToQuote: () => B2bButtonType;
        };
        shoppingList: {
          getButtonInfo: () => B2bButtonType;
          addProductFromPage: (item: any) => Promise<void>;
        };
      };
    };
  }
}
